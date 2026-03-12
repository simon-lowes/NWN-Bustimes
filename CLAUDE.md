# NWN-Bustimes (Last Bus Connector)

Timetable-based bus departures and AI transit assistant for North West Norfolk.
Built for an elderly relative (83) — clarity and correctness are paramount.

## Repo
- GitHub: `simon-lowes/NWN-Bustimes`
- Branch: `main` (single branch)

## Stack
- **Frontend:** React 19 + Vite + Tailwind v4
- **Backend:** Express server (`server.ts`) — serves timetable data + proxies AI requests
- **AI:** Google Gemini 2.5 Flash via `@google/genai` SDK (server-side only)
- **Runtime:** Node 22 with `--import=tsx` for TypeScript execution
- **Build:** Vite for frontend, Dockerfile for production (multi-stage)

## Architecture
- `server.ts` — Express entry point: `POST /api/ai/ask`, `GET /api/departures/:atcocode`, `GET /api/alerts`, `GET /api/bustimes/*` proxy, static file serving. Server blocks startup until timetable cache is populated.
- `server/departures.ts` — **Timetable-only** data layer:
  - Scrapes bustimes.org HTML for timetable data (cheerio)
  - 4-hour TTL cache, background refresh at 6/10/14/18 UK time + startup
  - `getDepartureSummary()` builds plain-text summary injected into every AI prompt
  - `STAND_DESTINATIONS` maps ATCO codes to human-readable destination labels (critical for AI context — scraped direction text is misleading)
  - Alerts disabled (returns `[]`) — will re-enable when reliable confirmation method found
  - **All live data code (nextbuses.mobi, live cache, alert detection, cooldowns) removed.** See git commit `0f263c2` for full implementation.
- `server/aiService.ts` — Gemini integration:
  - `getUkTime()` fetches authoritative UK time from worldtimeapi.org (3s timeout, fallback to server clock)
  - `askBusQuestion()` injects departure summary + verified UK time into every prompt
  - System instruction: departure data is "ground truth", must never be contradicted
- `src/services/transportApi.ts` — Thin fetch wrapper for departures + alerts
- `src/hooks/useBusDepartures.ts` — On-demand fetch (no polling): fetches on mount/destination change/manual refresh
- `src/hooks/useAiAssistant.ts` — AI chat with AbortController + `clearResponse()` for full state reset
- `src/components/ErrorBoundary.tsx` — React error boundary

## ATCO Codes (verified)
- Hunstanton Stand A (departures to KL): `2900H5315`
- Hunstanton Stand B (departures to Fakenham): `2900H5314`
- Hunstanton Bay 1 (arrivals only, NOT for departures): `2900H5316`
- King's Lynn Stand C (routes 2, 3): `2900K13139`
- King's Lynn Stand E (routes 33-36): `2900K13141`
- King's Lynn Stand G (routes 41, 42): `2900K13143`
- King's Lynn Stand H (routes 3H, 4, 5, 32, 47): `2900K13144`

## Deployment
- **Live:** `https://bustimes.simonlowes.cloud`
- **Hosted via:** Dokploy on Hostinger VPS (76.13.255.213)
- **Build type:** Dockerfile (not Nixpacks)
- **Docker service name:** `nwnbustimes-1etasu`
- **Container port:** 3001
- **No auto-deploy** — Dokploy webhooks not configured. Manual deploy:
  ```
  ssh simon@76.13.255.213 "cd /tmp && git clone https://github.com/simon-lowes/NWN-Bustimes.git && cd NWN-Bustimes && sudo docker build -t nwnbustimes-1etasu:latest . 2>&1 | tail -5 && sudo docker service update --force --image nwnbustimes-1etasu:latest nwnbustimes-1etasu 2>&1 | tail -3 && cd /tmp && rm -rf NWN-Bustimes"
  ```
- **Env vars (set via docker service update, not Dokploy UI):**
  - `GEMINI_API_KEY` — Google Gemini API key (restricted to Generative Language API)
  - `PORT=3001`
- **DNS:** Cloudflare A record → 76.13.255.213, orange cloud proxied
- **SSL:** Traefik handles origin cert, Cloudflare handles edge

## Key Decisions
- **Timetable-only** — live data sources (nextbuses.mobi) were corrupting timetable data and causing incorrect AI responses. Removed entirely until a reliable confirmation method is found.
- API key is server-side only — never in client bundle
- TypeScript strict mode + `noUncheckedIndexedAccess` enabled
- Stand selection filters departures (not direction keyword matching) — scraped directions show terminus names, not neighborhoods
- `todayStr()` uses UK timezone (Intl.DateTimeFormat), NOT UTC — avoids off-by-one during BST
- Departure summary omits scraped direction text — AI was misinterpreting "to King's Lynn" on buses departing King's Lynn
- `.env` file is local-only, gitignored. Docker gets env vars via service update.

## Known Issues
- Gemini responses can be slow; may hit Cloudflare timeout on complex queries
- Dokploy UI wouldn't accept environment variables — had to inject via `sudo docker service update --env-add`
- bustimes.org sometimes returns duplicate rows — deduplication applied at scrape time
- No auto-deploy: must SSH to VPS and manually build/deploy (see Deployment section)

## Critical Lessons (from 8 March 2026 session)
- AI had zero access to app's own departure data — injecting `getDepartureSummary()` into every prompt was the fix
- `toLocaleString('en-GB')` without `weekday: 'long'` caused Gemini to guess the day wrong
- Server clock can drift — worldtimeapi.org provides authoritative UK time
- bustimes.org direction text is unreliable (e.g., "to King's Lynn" for buses leaving King's Lynn) — use `STAND_DESTINATIONS` labels instead
- `slice(0, 4)` on departure summary hid the last bus — never truncate departure data
- Startup race: server must await timetable cache population before accepting requests
