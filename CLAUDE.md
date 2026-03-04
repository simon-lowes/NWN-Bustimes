# NWN-Bustimes (Last Bus Connector)

Real-time bus departures and AI transit assistant for North West Norfolk.

## Repo
- GitHub: `simon-lowes/NWN-Bustimes`
- Branch: `main` (single branch)

## Stack
- **Frontend:** React 19 + Vite + Tailwind v4
- **Backend:** Express server (`server.ts`) — proxies AI and bustimes.org requests
- **AI:** Google Gemini 2.5 Flash via `@google/genai` SDK (server-side only)
- **Runtime:** Node 22 with `--import=tsx` for TypeScript execution
- **Build:** Vite for frontend, Dockerfile for production (multi-stage)

## Architecture
- `server.ts` — Express entry point: `POST /api/ai/ask`, `GET /api/bustimes/*` proxy, static file serving
- `server/aiService.ts` — Server-side Gemini logic with lazy SDK init (`getAi()` pattern)
- `src/services/aiService.ts` — Thin fetch wrapper (client-side, no SDK)
- `src/services/transportApi.ts` — Bus departure data (currently uses mock data — bustimes.org has no JSON departures API)
- `src/hooks/useBusDepartures.ts` — Bus data fetching with AbortController
- `src/hooks/useAiAssistant.ts` — AI chat with AbortController
- `src/components/ErrorBoundary.tsx` — React error boundary

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
- ATCO codes in transportApi.ts are placeholders (2900H0120, 2900K1356) — real codes are 2900H5316 (Hunstanton) and 2900K132 (King's Lynn) but departures endpoint is HTML-only, so mock data is used regardless
- `.env` file is local-only, gitignored. Docker gets env vars via service update.

## Known Issues
- bustimes.org has no JSON API for departures — app always shows mock timetable data
- Gemini responses can be slow; may hit Cloudflare timeout on complex queries
- Dokploy UI wouldn't accept environment variables — had to inject via `sudo docker service update --env-add`
