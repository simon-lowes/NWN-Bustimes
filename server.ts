import express from 'express';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { askBusQuestion } from './server/aiService.js';
import { getDepartures, getAlerts, startBackgroundJobs } from './server/departures.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Trust first proxy (Traefik) so rate limiter sees real client IP via X-Forwarded-For
app.set('trust proxy', 1);

// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind/inline styles
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));

// Rate limit the AI endpoint — Gemini calls are expensive and slow
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 10,               // 10 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});

app.use(express.json({ limit: '16kb' }));

// AI endpoint — proxies to Gemini server-side
app.post('/api/ai/ask', aiLimiter, async (req, res) => {
  try {
    const { question, location } = req.body as {
      question?: string;
      location?: { lat: number; lng: number };
    };

    if (!question || typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ error: 'Missing or empty "question" field' });
      return;
    }

    if (question.length > 500) {
      res.status(400).json({ error: 'Question is too long (max 500 characters)' });
      return;
    }

    if (location && (typeof location.lat !== 'number' || typeof location.lng !== 'number' || !isFinite(location.lat) || !isFinite(location.lng))) {
      res.status(400).json({ error: 'Invalid location' });
      return;
    }

    const response = await askBusQuestion(question, location);
    res.json(response);
  } catch (err) {
    console.error('AI request failed:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// Departures — timetable only (live data used exclusively for alert detection)
app.get('/api/departures/:atcocode', async (req, res) => {
  try {
    // ATCO codes are alphanumeric (e.g., 2900H5315)
    if (!/^[\dA-Za-z]+$/.test(req.params.atcocode)) {
      res.status(400).json({ error: 'Invalid ATCO code' });
      return;
    }

    const data = await getDepartures(req.params.atcocode);
    res.json(data);
  } catch (err) {
    console.error('Departures fetch failed:', err);
    res.status(502).json({ error: 'No departure data available' });
  }
});

// Alerts — cancellations detected by background comparison
app.get('/api/alerts', (_req, res) => {
  res.json(getAlerts());
});

// Bustimes.org proxy — relays requests to avoid CORS issues in production
// Restricted to /stops/ and /services/ paths to prevent abuse as an open proxy
app.get('/api/bustimes/*', async (req, res) => {
  const bustimesPath = req.url.replace(/^\/api\/bustimes\//, '');

  // Validate path: only allow stops/ and services/ endpoints, block traversal
  if (!/^(?:stops|services)\/[\w/-]+$/.test(bustimesPath)) {
    res.status(400).json({ error: 'Invalid bustimes path' });
    return;
  }

  const url = `https://bustimes.org/${bustimesPath}`;

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    res.status(upstream.status);

    // Forward content-type
    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const body = await upstream.text();
    res.send(body);
  } catch (err) {
    console.error('Bustimes proxy error:', err);
    res.status(502).json({ error: 'Upstream request failed' });
  }
});

// In production, serve the built Vite app
const distPath = path.resolve(import.meta.dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback — serve index.html for any non-API route
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Populate timetable cache before accepting requests, then start scheduled jobs
startBackgroundJobs().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
