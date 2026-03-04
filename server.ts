import express from 'express';
import path from 'path';
import { askBusQuestion } from './server/aiService.js';
import { getDepartures } from './server/departures.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(express.json());

// AI endpoint — proxies to Gemini server-side
app.post('/api/ai/ask', async (req, res) => {
  try {
    const { question, location } = req.body as {
      question?: string;
      location?: { lat: number; lng: number };
    };

    if (!question || typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ error: 'Missing or empty "question" field' });
      return;
    }

    const response = await askBusQuestion(question, location);
    res.json(response);
  } catch (err) {
    console.error('AI request failed:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// Real-time departures — scrapes nextbuses.mobi + bustimes.org fallback
app.get('/api/departures/:atcocode', async (req, res) => {
  try {
    const data = await getDepartures(req.params.atcocode);
    res.json(data);
  } catch (err) {
    console.error('Departures fetch failed:', err);
    res.status(502).json({ error: 'No departure data available' });
  }
});

// Bustimes.org proxy — relays requests to avoid CORS issues in production
app.get('/api/bustimes/*', async (req, res) => {
  const bustimesPath = req.url.replace(/^\/api\/bustimes\//, '');
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
