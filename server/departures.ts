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

const STOP_NAMES: Record<string, string> = {
  '2900H5315': 'Hunstanton Bus Station (Stand A)',
  '2900H5314': 'Hunstanton Bus Station (Stand B)',
  '2900K13139': "King's Lynn Transport Interchange (Stand C)",
  '2900K13141': "King's Lynn Transport Interchange (Stand E)",
  '2900K13143': "King's Lynn Transport Interchange (Stand G)",
  '2900K13144': "King's Lynn Transport Interchange (Stand H)",
};

interface CacheEntry {
  data: StopDepartures;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 60 seconds

function todayStr(): string {
  return new Date().toISOString().split('T')[0] ?? '';
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

  // If no departures parsed, always fall through to bustimes.org —
  // nextbuses "0 departures" may just mean it doesn't track this stop.
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

  if (departures.length === 0) return null;

  const name = STOP_NAMES[atcocode] ?? 'Bus Stop';
  return { atcocode, name, departures: groupByLine(departures) };
}

/**
 * Orchestrator: fetch both sources in parallel, prefer nextbuses (real-time)
 * but use bustimes when nextbuses has nothing.
 */
export async function getDepartures(atcocode: string): Promise<StopDepartures> {
  // Check cache
  const cached = cache.get(atcocode);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  // Fetch both sources in parallel
  const [nextbusesResult, bustimesResult] = await Promise.all([
    fetchNextBuses(atcocode).catch((err) => {
      console.warn(`nextbuses.mobi failed for ${atcocode}:`, err);
      return null;
    }),
    fetchBustimesXhr(atcocode).catch((err) => {
      console.warn(`bustimes.org failed for ${atcocode}:`, err);
      return null;
    }),
  ]);

  // Prefer nextbuses (has real-time "in X mins"), fall back to bustimes
  const result = nextbusesResult ?? bustimesResult;

  if (result) {
    cache.set(atcocode, { data: result, expires: Date.now() + CACHE_TTL });
    return result;
  }

  // Both returned null — genuinely no departures
  const name = STOP_NAMES[atcocode] ?? 'Bus Stop';
  const empty: StopDepartures = { atcocode, name, departures: {} };
  cache.set(atcocode, { data: empty, expires: Date.now() + CACHE_TTL });
  return empty;
}
