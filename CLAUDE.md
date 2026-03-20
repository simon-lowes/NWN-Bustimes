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
  - 4-hour TTL cache, serves stale data on expiry until refresh succeeds. Background refresh triggers on expiry detection (checked every 60s) + startup.
  - `getDepartureSummary()` builds plain-text summary injected into every AI prompt
  - `STAND_DESTINATIONS` maps ATCO codes to human-readable destination labels (critical for AI context — scraped direction text is misleading)
  - Alerts disabled (returns `[]`) — will re-enable when reliable confirmation method found
  - **All live data code (nextbuses.mobi, live cache, alert detection, cooldowns) removed.** See git commit `0f263c2` for full implementation.
- `server/aiService.ts` — Gemini integration:
  - `getUkTime()` fetches authoritative UK time from worldtimeapi.org (3s timeout, fallback to server clock)
  - `askBusQuestion()` injects departure summary + verified UK time into every prompt
  - System instruction: data is "scheduled timetable data" (never "live"); empty data means "may not have loaded" not "no buses"; never say "no more buses" without citing last departed bus
  - Temperature 0.2 for consistent factual responses; 30s Gemini API timeout
  - Google Maps tool enabled (walking directions); Google Search disabled (was source of hallucinations)
- `src/services/transportApi.ts` — Thin fetch wrapper for departures + alerts (15s timeout on departures)
- `src/hooks/useBusDepartures.ts` — On-demand fetch (no polling): fetches on mount/destination change/manual refresh. Tracks individual fetch failures — shows error when ALL fetches fail instead of misleading "no buses".
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
- Gemini responses can be slow (30s timeout set; Cloudflare 100s proxy timeout as outer bound)
- Dokploy UI wouldn't accept environment variables — had to inject via `sudo docker service update --env-add`
- bustimes.org sometimes returns duplicate rows — deduplication applied at scrape time
- No auto-deploy: must SSH to VPS and manually build/deploy (see Deployment section)
- Server blocks startup for 12-20s while populating timetable cache — container restarts cause brief 502s

## Critical Lessons
### 8 March 2026
- AI had zero access to app's own departure data — injecting `getDepartureSummary()` into every prompt was the fix
- `toLocaleString('en-GB')` without `weekday: 'long'` caused Gemini to guess the day wrong
- Server clock can drift — worldtimeapi.org provides authoritative UK time
- bustimes.org direction text is unreliable (e.g., "to King's Lynn" for buses leaving King's Lynn) — use `STAND_DESTINATIONS` labels instead
- `slice(0, 4)` on departure summary hid the last bus — never truncate departure data
- Startup race: server must await timetable cache population before accepting requests

### 20 March 2026
- `.catch(() => null)` on fetch calls is a silent failure antipattern — network errors were displayed as "no buses" instead of error messages
- System prompt wording matters: "VERIFIED LIVE DEPARTURE DATA" caused Gemini to claim it had live/real-time data. Use "SCHEDULED TIMETABLE DATA".
- Default Gemini temperature (1.0) caused non-deterministic answers for factual queries — set to 0.2
- Cache TTL expiry must serve stale data, not empty — expired timetable data is better than no data
- Google Search tool allowed Gemini to pull in contradictory external transit info — disabled
- Every fetch in the chain needs a timeout: Gemini API, client AI fetch, client departures fetch, proxy upstream
- API responses need `Cache-Control: no-store` or Cloudflare may cache error responses
- Fixed-hour refresh schedule (6/10/14/18) had gaps — expiry-based refresh is more robust
