# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Server-side departure scraper (`server/departures.ts`) with tiered fallback: nextbuses.mobi (real-time) then bustimes.org (timetable)
- `GET /api/departures/:atcocode` endpoint with 60-second in-memory cache
- Multi-stand fetching for King's Lynn — each dropdown destination maps to the correct bus stand(s)
- `cheerio` dependency for HTML parsing

### Changed

- Client transport API (`transportApi.ts`) is now a thin fetch wrapper — all scraping logic is server-side
- ATCO codes updated to verified real codes: Hunstanton `2900H5316`, King's Lynn stands C/E/G/H
- Poll interval reduced from 5 minutes to 60 seconds (matches server cache TTL)
- Departure filtering uses stand-to-destination mapping instead of direction keyword matching

### Removed

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
