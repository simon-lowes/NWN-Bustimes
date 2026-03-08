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

// What destinations each King's Lynn stand serves — critical for AI context
const STAND_DESTINATIONS: Record<string, string> = {
  '2900H5315': 'buses to King\'s Lynn',
  '2900H5314': 'buses to Fakenham',
  '2900K13139': 'buses to West Lynn (routes 2, 3)',
  '2900K13141': 'buses to Hospital, South Wootton, North Wootton, Hunstanton (routes 33-36)',
  '2900K13143': 'buses to Fairstead Estate (routes 41, 42)',
  '2900K13144': 'buses to Gaywood, Hospital (routes 3H, 4, 5, 32, 47)',
};

// All ATCO codes this app cares about
const ALL_ATCO_CODES = Object.keys(STOP_NAMES);

// --- Layer 1: Timetable Cache (bustimes.org, 4-hour TTL, background) ---

interface CacheEntry {
  data: StopDepartures;
  expires: number;
}

const timetableCache = new Map<string, CacheEntry>();
const TIMETABLE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// --- Layer 2: Live Cache (nextbuses.mobi, 5-minute TTL, on-demand) ---

const liveCache = new Map<string, CacheEntry>();
const LIVE_TTL = 5 * 60 * 1000; // 5 minutes

// --- Layer 3: Alerts ---

let alerts: Alert[] = [];

export function getAlerts(): Alert[] {
  return alerts;
}

// --- Request Cooldown (10s minimum between nextbuses.mobi requests) ---

const lastRequestTime = new Map<string, number>();
const COOLDOWN_MS = 10_000; // 10 seconds (respects nextbuses.mobi crawl-delay)

function canRequestSource(source: string): boolean {
  const last = lastRequestTime.get(source);
  if (!last) return true;
  return Date.now() - last >= COOLDOWN_MS;
}

function markRequested(source: string): void {
  lastRequestTime.set(source, Date.now());
}

// Wait until cooldown expires for a source, then proceed
async function waitForCooldown(source: string): Promise<void> {
  const last = lastRequestTime.get(source);
  if (!last) return;
  const elapsed = Date.now() - last;
  if (elapsed < COOLDOWN_MS) {
    await new Promise((resolve) => setTimeout(resolve, COOLDOWN_MS - elapsed));
  }
}

// --- Helpers ---

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

function timeDiffMinutes(a: string, b: string): number {
  const am = timeToMinutes(a);
  const bm = timeToMinutes(b);
  const diff = Math.abs(am - bm);
  return Math.min(diff, 1440 - diff); // handles midnight wrap
}

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

function makeDeparture(
  line: string,
  direction: string,
  time: string,
  date: string
): BusDeparture {
  return {
    line,
    direction,
    aimed_departure_time: time,
    expected_departure_time: time,
    best_departure_estimate: time,
    date,
  };
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

// --- Merge & Filter ---

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

/**
 * Overlay live data onto timetable base.
 * For each timetabled departure, find the closest live departure with the same
 * line and aimed time within 10 minutes. If matched, overlay live timing.
 * Unmatched live departures are appended as extras.
 */
function mergeDepartures(
  timetable: StopDepartures,
  live: StopDepartures
): StopDepartures {
  const merged: Record<string, BusDeparture[]> = {};

  // Process each timetable line
  for (const [line, timetabledDeps] of Object.entries(timetable.departures)) {
    const liveDeps = live.departures[line] ? [...live.departures[line]] : [];
    const used = new Set<number>();
    const result: BusDeparture[] = [];

    for (const ttDep of timetabledDeps) {
      let bestIdx = -1;
      let bestDiff = Infinity;

      for (let i = 0; i < liveDeps.length; i++) {
        if (used.has(i)) continue;
        const diff = timeDiffMinutes(ttDep.aimed_departure_time, liveDeps[i]!.aimed_departure_time);
        if (diff <= 10 && diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        const liveDep = liveDeps[bestIdx]!;
        used.add(bestIdx);
        result.push({
          ...ttDep,
          expected_departure_time: liveDep.expected_departure_time,
          best_departure_estimate: liveDep.best_departure_estimate,
        });
      } else {
        result.push(ttDep);
      }
    }

    // Append unmatched live departures as extras
    for (let i = 0; i < liveDeps.length; i++) {
      if (!used.has(i)) {
        result.push(liveDeps[i]!);
      }
    }

    // Sort by aimed_departure_time
    result.sort((a, b) => timeToMinutes(a.aimed_departure_time) - timeToMinutes(b.aimed_departure_time));
    merged[line] = result;
  }

  // Lines in live data but not in timetable — pass through
  for (const [line, liveDeps] of Object.entries(live.departures)) {
    if (!merged[line]) {
      merged[line] = liveDeps;
    }
  }

  return { ...timetable, departures: merged };
}

/**
 * Primary source: nextbuses.mobi
 * Provides real-time "in X mins" countdown predictions when available.
 */
export async function fetchNextBuses(atcocode: string): Promise<StopDepartures | null> {
  const url = `https://nextbuses.mobi/WebView/BusStopSearch/BusStopSearchResults/${atcocode}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'NWN-Bustimes/1.0' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  // Extract stop name from heading
  const heading = $('h2').first().text().trim();
  const nameMatch = heading.match(/^Departures for (.+?)(?:\s*\[|$)/);
  const name = nameMatch?.[1]?.trim() ?? STOP_NAMES[atcocode] ?? 'Bus Stop';

  const departures: BusDeparture[] = [];
  const today = todayStr();
  const now = new Date();

  $('table.BusStops tr').each((_i, row) => {
    const $row = $(row);
    const lineEl = $row.find('td.Number a');
    const line = lineEl.text().trim();
    if (!line) return;

    // Collapse whitespace (nextbuses sometimes has newlines in text)
    const infoText = $row.find('td:not(.Number) p.Stops').text().trim().replace(/\s+/g, ' ');
    if (!infoText) return;

    // Parse "Destination at HH:MM" or "Destination in X mins"
    let direction: string;
    let time: string;

    const atMatch = infoText.match(/^(.+?)\s+at\s+(\d{1,2}:\d{2})$/);
    const inMatch = infoText.match(/^(.+?)\s+in\s+(\d+)\s+mins?$/);

    if (atMatch) {
      direction = atMatch[1]?.trim() ?? 'Unknown';
      time = atMatch[2] ?? '00:00';
    } else if (inMatch) {
      direction = inMatch[1]?.trim() ?? 'Unknown';
      const mins = parseInt(inMatch[2] ?? '0', 10);
      const estimated = new Date(now.getTime() + mins * 60_000);
      time = estimated.toTimeString().substring(0, 5);
    } else {
      return; // unparseable row
    }

    // Strip vehicle numbers from direction (e.g. "King's Lynn 3702 - SK68 TMZ" → "King's Lynn")
    direction = direction.replace(/\s+\d{4}\s*-\s*[A-Z0-9]+(?:\s+[A-Z0-9]+)*$/, '').trim();

    departures.push(makeDeparture(line, direction, time, today));
  });

  // If no departures parsed, return null to fall through
  if (departures.length === 0) {
    return null;
  }

  return { atcocode, name, departures: groupByLine(departures) };
}

/**
 * Fallback source: bustimes.org /departures endpoint
 * Returns timetable data (scheduled times, no real-time).
 */
export async function fetchBustimesXhr(atcocode: string): Promise<StopDepartures | null> {
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

  // Skip header row, parse each departure row
  $('table tbody tr').each((_i, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    if (cells.length < 3) return; // skip header or malformed rows

    const line = $(cells[0]).text().trim();
    // Remove vehicle info div before extracting direction text
    const dirCell = $(cells[1]).clone();
    dirCell.find('.vehicle').remove();
    const direction = dirCell.text().trim();
    const scheduled = $(cells[2]).text().trim();
    // 4th column is real-time "Expected" when available
    const expected = cells[3] ? $(cells[3]).text().trim() : '';

    if (!line || !scheduled) return;

    // Validate time format (HH:MM)
    if (!/^\d{1,2}:\d{2}$/.test(scheduled)) return;
    const bestTime = /^\d{1,2}:\d{2}$/.test(expected) ? expected : scheduled;

    departures.push({
      line,
      direction: direction || 'Unknown',
      aimed_departure_time: scheduled,
      expected_departure_time: bestTime,
      best_departure_estimate: bestTime,
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

/**
 * Get departures for a stop.
 * Returns timetable data only — live sources are used exclusively for alert detection.
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
 * Used to ground the AI assistant in real data so it cannot hallucinate schedules.
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
      // Deduplicate by aimed time and show ALL departures (last bus is critical)
      const seen = new Set<string>();
      const times: string[] = [];
      for (const d of deps) {
        const key = d.aimed_departure_time;
        if (seen.has(key)) continue;
        seen.add(key);
        const dir = d.direction !== 'Unknown' ? ` to ${d.direction}` : '';
        times.push(`${d.aimed_departure_time}${dir}`);
      }
      depStrings.push(`  Route ${line}: ${times.join(', ')} (LAST: ${times[times.length - 1]})`);
    }
    lines.push(`${stopName} (${serves}):\n${depStrings.join('\n')}`);
  }

  return lines.join('\n\n');
}

// --- Background Jobs ---

/**
 * Populate timetable cache for all stops from bustimes.org.
 * Fetches sequentially with cooldown to be respectful.
 */
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
      // Small delay between requests to bustimes.org (respectful)
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    } catch (err) {
      console.warn(`[timetable] Failed for ${atcocode}:`, err);
    }
  }

  console.log(`[timetable] Cache populated for ${populated}/${ALL_ATCO_CODES.length} stops`);
}

/**
 * Alert check: compare live data vs timetable to detect potential cancellations.
 * Fetches nextbuses.mobi for all stops and compares with timetable cache.
 */
/**
 * Alert check with dual-source confirmation.
 * An alert is only raised if BOTH sources agree a service is missing:
 *   1. nextbuses.mobi does not list the route
 *   2. bustimes.org shows no "Expected" time for upcoming departures on that route
 * If only one source flags an issue, timetable overrides — no alert shown.
 */
async function checkForAlerts(): Promise<void> {
  console.log('[alerts] Running dual-source alert check...');
  const newAlerts: Alert[] = [];
  const nowTime = getUKTimeNow();
  const detectedAt = new Date().toISOString();

  for (const atcocode of ALL_ATCO_CODES) {
    const timetable = timetableCache.get(atcocode);
    if (!timetable) continue;

    // Source 1: nextbuses.mobi
    await waitForCooldown('nextbuses');
    markRequested('nextbuses');
    const live = await fetchNextBuses(atcocode).catch(() => null);

    // Source 2: fresh bustimes.org scrape (has Expected column)
    await waitForCooldown('bustimes');
    markRequested('bustimes');
    const freshTimetable = await fetchBustimesXhr(atcocode).catch(() => null);

    const standName = STOP_NAMES[atcocode] ?? atcocode;

    for (const [line, timetabledDeps] of Object.entries(timetable.data.departures)) {
      // Find departures in the next 2 hours
      const upcoming = timetabledDeps.filter((dep) =>
        dep.aimed_departure_time >= nowTime &&
        dep.aimed_departure_time <= timeAdd(nowTime, 120)
      );
      if (upcoming.length === 0) continue;

      // Check source 1: is this route missing from nextbuses.mobi?
      const missingFromLive = !live || !live.departures[line];

      // Check source 2: does bustimes.org show no expected times for this route?
      let noExpectedTimes = false;
      if (freshTimetable?.departures[line]) {
        const freshDeps = freshTimetable.departures[line];
        const upcomingFresh = freshDeps.filter((dep) =>
          dep.aimed_departure_time >= nowTime &&
          dep.aimed_departure_time <= timeAdd(nowTime, 120)
        );
        // If all upcoming departures have expected === aimed (no live tracking), that's not confirmation.
        // But if expected times are completely absent or all differ wildly, flag it.
        noExpectedTimes = upcomingFresh.length === 0;
      } else {
        // Route not even in fresh timetable scrape — confirms it's gone
        noExpectedTimes = true;
      }

      // Only alert if BOTH sources confirm the issue
      if (missingFromLive && noExpectedTimes) {
        newAlerts.push({
          line,
          stand: standName,
          message: `Route ${line} not appearing in live tracking or current timetable — likely cancelled`,
          detectedAt,
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  alerts = newAlerts;
  console.log(`[alerts] Dual-source check complete: ${newAlerts.length} confirmed alert(s)`);
}

/** Add minutes to a HH:MM time string */
function timeAdd(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Get current hour in UK timezone.
 */
function getUKHour(): number {
  const ukTime = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false });
  return parseInt(ukTime, 10);
}

function getUKMinute(): number {
  const ukTime = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', minute: 'numeric' });
  return parseInt(ukTime, 10);
}

/**
 * Start all background jobs:
 * - Timetable refresh: every 4 hours (6 AM, 10 AM, 2 PM, 6 PM UK), plus on startup
 * - Alert check: 7:30 AM and 1:30 PM UK time
 */
export async function startBackgroundJobs(): Promise<void> {
  // Block until initial timetable cache is populated — prevents empty AI responses
  await refreshTimetableCache();

  // Check every minute for scheduled jobs
  setInterval(() => {
    const hour = getUKHour();
    const minute = getUKMinute();

    // Timetable refresh at 6, 10, 14, 18 UK time (at minute 0)
    if ([6, 10, 14, 18].includes(hour) && minute === 0) {
      void refreshTimetableCache();
    }

    // Alert check at 7:30 and 13:30 UK time
    if ((hour === 7 || hour === 13) && minute === 30) {
      void checkForAlerts();
    }
  }, 60_000); // check every minute

  console.log('[background] Background jobs started');
}
