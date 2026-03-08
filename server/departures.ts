import * as cheerio from 'cheerio';

export interface BusDeparture {
  line: string;
  direction: string;
  aimed_departure_time: string;
  expected_departure_time: string;
  best_departure_estimate: string;
  date: string;
}

export interface StopDepartures {
  atcocode: string;
  name: string;
  departures: {
    [line: string]: BusDeparture[];
  };
}

export interface Alert {
  line: string;
  stand: string;
  message: string;
  detectedAt: string;
}

const STOP_NAMES: Record<string, string> = {
  '2900H5315': 'Hunstanton Bus Station (Stand A)',
  '2900H5314': 'Hunstanton Bus Station (Stand B)',
  '2900K13139': "King's Lynn Transport Interchange (Stand C)",
  '2900K13141': "King's Lynn Transport Interchange (Stand E)",
  '2900K13143': "King's Lynn Transport Interchange (Stand G)",
  '2900K13144': "King's Lynn Transport Interchange (Stand H)",
};

// What destinations each stand serves — critical for AI context
const STAND_DESTINATIONS: Record<string, string> = {
  '2900H5315': 'buses to King\'s Lynn',
  '2900H5314': 'buses to Fakenham',
  '2900K13139': 'buses to West Lynn (routes 2, 3)',
  '2900K13141': 'buses to Hospital, South Wootton, North Wootton, Hunstanton (routes 33-36)',
  '2900K13143': 'buses to Fairstead Estate (routes 41, 42)',
  '2900K13144': 'buses to Gaywood, Hospital (routes 3H, 4, 5, 32, 47)',
};

const ALL_ATCO_CODES = Object.keys(STOP_NAMES);

// --- Timetable Cache (bustimes.org, 4-hour TTL) ---

interface CacheEntry {
  data: StopDepartures;
  expires: number;
}

const timetableCache = new Map<string, CacheEntry>();
const TIMETABLE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// --- Helpers ---

function getUKTimeNow(): string {
  return new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function todayStr(): string {
  // Use UK timezone, not UTC — avoids off-by-one during BST (midnight-1am)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function groupByLine(departures: BusDeparture[]): Record<string, BusDeparture[]> {
  const grouped: Record<string, BusDeparture[]> = {};
  for (const dep of departures) {
    const bucket = grouped[dep.line];
    if (bucket) {
      bucket.push(dep);
    } else {
      grouped[dep.line] = [dep];
    }
  }
  return grouped;
}

// --- Filter ---

/**
 * Remove departures whose best_departure_estimate is in the past (UK time).
 * Departures dated tomorrow are kept regardless.
 */
function filterPastDepartures(stop: StopDepartures): StopDepartures {
  const now = getUKTimeNow();
  const today = todayStr();
  const filtered: Record<string, BusDeparture[]> = {};

  for (const [line, deps] of Object.entries(stop.departures)) {
    const kept = deps.filter(
      (dep) => dep.date !== today || dep.best_departure_estimate >= now
    );
    if (kept.length > 0) {
      filtered[line] = kept;
    }
  }

  return { ...stop, departures: filtered };
}

// --- Timetable Source: bustimes.org ---

async function fetchBustimesXhr(atcocode: string): Promise<StopDepartures | null> {
  const url = `https://bustimes.org/stops/${atcocode}/departures`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'NWN-Bustimes/1.0',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  const departures: BusDeparture[] = [];
  const today = todayStr();

  $('table tbody tr').each((_i, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    if (cells.length < 3) return;

    const line = $(cells[0]).text().trim();
    const dirCell = $(cells[1]).clone();
    dirCell.find('.vehicle').remove();
    const direction = dirCell.text().trim();
    const scheduled = $(cells[2]).text().trim();

    if (!line || !scheduled) return;
    if (!/^\d{1,2}:\d{2}$/.test(scheduled)) return;

    departures.push({
      line,
      direction: direction || 'Unknown',
      aimed_departure_time: scheduled,
      expected_departure_time: scheduled,
      best_departure_estimate: scheduled,
      date: today,
    });
  });

  // Deduplicate: bustimes.org sometimes returns duplicate rows with different trip IDs
  const seen = new Set<string>();
  const deduped = departures.filter((d) => {
    const key = `${d.line}|${d.aimed_departure_time}|${d.direction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length === 0) return null;

  const name = STOP_NAMES[atcocode] ?? 'Bus Stop';
  return { atcocode, name, departures: groupByLine(deduped) };
}

// --- Public API ---

/**
 * Get departures for a stop. Timetable only.
 */
export async function getDepartures(
  atcocode: string,
): Promise<StopDepartures> {
  const name = STOP_NAMES[atcocode] ?? 'Bus Stop';
  const empty: StopDepartures = { atcocode, name, departures: {} };

  const timetableEntry = timetableCache.get(atcocode);
  const base: StopDepartures = (timetableEntry && timetableEntry.expires > Date.now())
    ? timetableEntry.data
    : empty;

  return filterPastDepartures(base);
}

/**
 * Build a plain-text summary of current departures for all stops.
 * Used to ground the AI assistant in real timetable data.
 */
export async function getDepartureSummary(): Promise<string> {
  const lines: string[] = [];

  for (const atcocode of ALL_ATCO_CODES) {
    const data = await getDepartures(atcocode);
    const stopName = data.name;
    const serves = STAND_DESTINATIONS[atcocode] ?? '';
    const allDeps = Object.entries(data.departures);

    if (allDeps.length === 0) {
      lines.push(`${stopName} (${serves}): No upcoming departures found.`);
      continue;
    }

    const depStrings: string[] = [];
    for (const [line, deps] of allDeps) {
      const seen = new Set<string>();
      const times: string[] = [];
      for (const d of deps) {
        if (seen.has(d.aimed_departure_time)) continue;
        seen.add(d.aimed_departure_time);
        times.push(d.aimed_departure_time);
      }
      depStrings.push(`  Route ${line}: ${times.join(', ')} (LAST: ${times[times.length - 1]})`);
    }
    lines.push(`${stopName} (${serves}):\n${depStrings.join('\n')}`);
  }

  return lines.join('\n\n');
}

/**
 * Alerts are disabled. Returns empty array.
 * Live alert detection was causing more problems than it solved —
 * will be re-enabled when a reliable confirmation method is found.
 */
export function getAlerts(): Alert[] {
  return [];
}

// --- Background Jobs ---

async function refreshTimetableCache(): Promise<void> {
  console.log('[timetable] Refreshing timetable cache for all stops...');
  let populated = 0;

  for (const atcocode of ALL_ATCO_CODES) {
    try {
      const result = await fetchBustimesXhr(atcocode);
      if (result) {
        timetableCache.set(atcocode, { data: result, expires: Date.now() + TIMETABLE_TTL });
        populated++;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    } catch (err) {
      console.warn(`[timetable] Failed for ${atcocode}:`, err);
    }
  }

  console.log(`[timetable] Cache populated for ${populated}/${ALL_ATCO_CODES.length} stops`);
}

function getUKHour(): number {
  const ukTime = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false });
  return parseInt(ukTime, 10);
}

function getUKMinute(): number {
  const ukTime = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', minute: 'numeric' });
  return parseInt(ukTime, 10);
}

/**
 * Start background jobs: timetable refresh only.
 * Live sources (nextbuses.mobi, alert detection) are commented out —
 * they were corrupting timetable data and causing incorrect AI responses.
 * Will be re-enabled when a reliable confirmation method is found.
 */
export async function startBackgroundJobs(): Promise<void> {
  await refreshTimetableCache();

  setInterval(() => {
    const hour = getUKHour();
    const minute = getUKMinute();

    if ([6, 10, 14, 18].includes(hour) && minute === 0) {
      void refreshTimetableCache();
    }

    // DISABLED: Live alert detection
    // if ((hour === 7 || hour === 13) && minute === 30) {
    //   void checkForAlerts();
    // }
  }, 60_000);

  console.log('[background] Timetable-only background jobs started');
}

// =============================================================================
// DISABLED: Live data sources and alert detection
// Kept for future re-enablement when a reliable confirmation method is found.
// =============================================================================
//
// import type needed: fetchNextBuses, mergeDepartures, checkForAlerts,
// liveCache, LIVE_TTL, cooldown helpers, timeToMinutes, timeDiffMinutes,
// timeAdd, makeDeparture, canRequestSource
//
// See git history (commit 0f263c2) for full implementation including:
// - fetchNextBuses(): nextbuses.mobi scraper
// - mergeDepartures(): live overlay onto timetable
// - checkForAlerts(): dual-source alert detection (nextbuses + bustimes expected times)
// - Live cache with 5-minute TTL
// - Request cooldown (10s between nextbuses.mobi requests)
// =============================================================================
