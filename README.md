# Last Bus Connector - NW Norfolk

Real-time bus departures and AI transit assistant for the North West Norfolk constituency. Covers Hunstanton, King's Lynn, Heacham, Snettisham, Dersingham, and surrounding areas.

**Live:** [bustimes.simonlowes.cloud](https://bustimes.simonlowes.cloud)

## What it does

- Shows upcoming bus departures for key stops (Hunstanton, King's Lynn)
- AI assistant powered by Google Gemini answers natural language questions about bus routes, connections, and schedules
- Uses Google Maps and Search grounding for accurate, real-time transit information
- Mobile-friendly dark UI

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS v4
- **Backend:** Express (TypeScript via tsx)
- **AI:** Google Gemini 2.5 Flash with Maps + Search grounding
- **Deployment:** Docker, Dokploy, Traefik, Cloudflare

## Run locally

```bash
cp .env.example .env
# Add your Gemini API key to .env

npm install
npm run dev
```

This starts both the Vite dev server (port 3000) and Express backend (port 3001).

## Production

```bash
npm run build
npm run start
```

Or with Docker:

```bash
docker build -t nwn-bustimes .
docker run -e GEMINI_API_KEY=your-key -e PORT=3001 -p 3001:3001 nwn-bustimes
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key (server-side only) |
| `PORT` | No | Express server port (default: 3001) |
