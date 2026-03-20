# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- **Network errors displayed as "no buses" instead of error message** — `.catch(() => null)` on departure fetches silently swallowed network failures, showing "No buses running right now" on bad wifi instead of an error. Now tracks fetch successes and shows connection error when all fetches fail.
- **Gemini claiming "live data" / "real-time data"** — system prompt said "VERIFIED LIVE DEPARTURE DATA" which Gemini parroted. Reworded to "SCHEDULED TIMETABLE DATA".
- **Non-deterministic AI answers** — no temperature was set (defaulted to 1.0). Set to 0.2 for consistent factual responses.
- **"No more buses today" at 5pm** — cache TTL expiry returned empty data instead of stale. Now serves expired cache entries until a successful refresh replaces them.
- **Gemini confused by user corrections** — "ground truth, must never be contradicted" instruction conflicted with user saying "that's wrong". New prompt acknowledges data may not have loaded and suggests refreshing.
- **Google Search injecting contradictory transit data** — disabled Google Search tool (kept Maps for walking directions only).

### Added

- Timeouts across the full request chain: Gemini API 30s, AI client fetch 45s, departures client fetch 15s, bustimes.org proxy 10s
- `Cache-Control: no-store` on all `/api/*` responses to prevent Cloudflare caching error responses
- Cache refresh now triggers on expiry detection (checked every 60s) instead of fixed hours (6/10/14/18)
- System prompt rules: never say "no more buses" without citing the last departed bus; handle empty data as "may not have loaded"

### Removed

- Google Search tool from Gemini config (was a source of hallucinated "live" transit data)

## [0.1.0] - 2026-03-04

### Added

- Initial release of Last Bus Connector
- React 19 + Vite + Tailwind v4 frontend with brutalist transit board design
- Hunstanton and King's Lynn departure cards with next/last bus display
- Destination selector dropdown (Fairstead, QE Hospital, Gaywood, South Wootton, North Wootton, West Lynn)
- AI transit assistant powered by Google Gemini 2.5 Flash (server-side)
- Express backend with bustimes.org CORS proxy and AI endpoint
- Dockerfile for production deployment
- Error boundary component

### Fixed

- AI response text invisible on mobile due to colour inheritance (2026-03-04)
