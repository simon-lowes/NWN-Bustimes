# NWN-Bustimes (Last Bus Connector)

Real-time bus departures and AI transit assistant for North West Norfolk.

## Repo
- GitHub: `simon-lowes/NWN-Bustimes`
- Branch: `main` (single branch)

## Stack
- **Frontend:** React 19 + Vite + Tailwind v4
- **Backend:** Express server (`server.ts`) — scrapes real-time departures + proxies AI requests
- **AI:** Google Gemini 2.5 Flash via `@google/genai` SDK (server-side only)
- **Runtime:** Node 22 with `--import=tsx` for TypeScript execution
- **Build:** Vite for frontend, Dockerfile for production (multi-stage)

## Architecture
- `server.ts` — Express entry point: `POST /api/ai/ask`, `GET /api/departures/:atcocode?live=true`, `GET /api/alerts`, `GET /api/bustimes/*` proxy, static file serving
- `server/departures.ts` — Three-layer cache with background jobs:
  - **Layer 1 (Timetable):** bustimes.org, 4-hour TTL, background refresh at 6/10/14/18 UK time + startup
  - **Layer 2 (Live):** nextbuses.mobi, 5-minute TTL, on-demand when `?live=true`
  - **Layer 3 (Alerts):** Compares live vs timetable at 7:30/13:30 UK time, exposed via `GET /api/alerts`
  - 10-second cooldown between nextbuses.mobi requests (respects crawl-delay)
- `server/aiService.ts` — Server-side Gemini logic with lazy SDK init (`getAi()` pattern)
- `src/services/transportApi.ts` — Thin fetch wrapper for departures + alerts (no mock data)
- `src/hooks/useBusDepartures.ts` — On-demand fetch (no polling): fetches live on mount/destination change/manual refresh
- `src/hooks/useAiAssistant.ts` — AI chat with AbortController
- `src/components/ErrorBoundary.tsx` — React error boundary

## ATCO Codes (verified)
- Hunstanton Stand A (departures to KL): `2900H5315`
- Hunstanton Stand B (departures to Fakenham): `2900H5314`
- Hunstanton Bay 1 (arrivals only, NOT for departures): `2900H5316`
- King's Lynn Stand C (routes 2, 3): `2900K13139`
- King's Lynn Stand E (routes 33-36): `2900K13141`
- King's Lynn Stand G (routes 41, 42): `2900K13143`
- King's Lynn Stand H: `2900K13144`

## Deployment
- **Live:** `https://bustimes.simonlowes.cloud`
- **Hosted via:** Dokploy on Hostinger VPS (76.13.255.213)
- **Build type:** Dockerfile (not Nixpacks)
- **Docker service name:** `nwnbustimes-1etasu`
- **Container port:** 3001
- **Env vars (set via docker service update, not Dokploy UI):**
  - `GEMINI_API_KEY` — Google Gemini API key (restricted to Generative Language API)
  - `PORT=3001`
- **DNS:** Cloudflare A record → 76.13.255.213, orange cloud proxied
- **SSL:** Traefik handles origin cert, Cloudflare handles edge

## Key Decisions
- API key is server-side only — never in client bundle
- TypeScript strict mode + `noUncheckedIndexedAccess` enabled
- Real-time data via server-side HTML scraping (nextbuses.mobi primary, bustimes.org fallback) — no mock data
- Stand selection filters departures (not direction keyword matching) — nextbuses directions show terminus names, not neighborhoods
- `.env` file is local-only, gitignored. Docker gets env vars via service update.

## Known Issues
- Gemini responses can be slow; may hit Cloudflare timeout on complex queries
- Dokploy UI wouldn't accept environment variables — had to inject via `sudo docker service update --env-add`
- nextbuses.mobi occasionally includes vehicle numbers in direction text (regex-stripped)
