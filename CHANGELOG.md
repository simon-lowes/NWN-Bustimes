# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- FINAL_SERVICE showing wrong last bus (e.g. 17:50 instead of 22:05) because `getDepartures(live=true)` returned only nextbuses.mobi data (~5-10 upcoming departures), discarding the full-day timetable
- NEXT_DEPARTURE could show past departure times (e.g. 06:40 in the afternoon)

### Changed

- `getDepartures()` now uses timetable as the base dataset; live data overlays real-time delay info onto timetable entries instead of replacing them
- Past departures are filtered server-side (UK timezone) before returning — `departures[0]` is always the next upcoming bus
- New `mergeDepartures()` matches live data to timetable entries by line + aimed time within 10 minutes, with midnight-wrap safety

### Added

- Three-layer smart caching strategy replacing continuous 60s polling
  - **Timetable cache:** bustimes.org background refresh every 4 hours (6/10/14/18 UK time) + on server startup
  - **Live cache:** nextbuses.mobi on-demand with 5-minute TTL, triggered by user interaction only
  - **Alert system:** compares live vs timetable data at 7:30/13:30 UK time to detect potential cancellations
- `GET /api/alerts` endpoint returning detected service disruptions
- `?live=true` query parameter on `GET /api/departures/:atcocode` for on-demand real-time data
- 10-second cooldown between nextbuses.mobi requests (respects `Crawl-delay: 10` in robots.txt)
- REFRESH button in header for manual live data fetch
- Orange alert banner above departure boards when cancellations detected
- LAST_SYNC label shows data source (`[LIVE]` or `[TIMETABLE]`)

### Changed

- Upstream request volume reduced from ~8,640–11,520/day to ~36–76/day (99.5% reduction)
- Client no longer polls on a timer — fetches on mount, destination change, and manual refresh only
- Server background jobs handle timetable population and alert checks independently of client requests

### Previous (pre-caching)

- Server-side departure scraper (`server/departures.ts`) fetching both nextbuses.mobi and bustimes.org in parallel
- `GET /api/departures/:atcocode` endpoint with 60-second in-memory cache
- Multi-stand fetching for both stations — Hunstanton uses Stand A + B, King's Lynn maps destinations to correct stand(s)
- bustimes.org parser uses "Expected" column for real-time times when available
- `cheerio` dependency for HTML parsing
- Client transport API (`transportApi.ts`) is now a thin fetch wrapper — all scraping logic is server-side
- Both data sources fetched concurrently (not sequential fallback) — nextbuses preferred for real-time, bustimes fills gaps
- ATCO codes verified: Hunstanton Stand A `2900H5315` + Stand B `2900H5314` (Bay 1 is arrivals-only), King's Lynn stands C/E/G/H
- Departure filtering uses stand-to-destination mapping instead of direction keyword matching

### Removed

- 60-second client-side polling interval
- All mock departure data (`getMockDepartures`, `makeDeparture`, hardcoded timetables)
- `getTimetable()` function and `TimetableResponse` interface (no longer needed)
- `BustimesApiDeparture` interface and bustimes.org JSON parsing (replaced by HTML scraping)
- "Tomorrow" re-fetch logic (scraping sources only return upcoming departures)
- `isMock` flag from `StopDepartures` interface

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
