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
  isMock?: boolean;
  departures: {
    [line: string]: BusDeparture[];
  };
}

export interface TimetableResponse {
  departures: {
    [line: string]: BusDeparture[];
  };
}

interface BustimesApiDeparture {
  line_name?: string;
  service_number?: string;
  service?: { line_name?: string; destination?: string };
  destination?: string;
  direction?: string;
  aimed_departure_time?: string;
  scheduled_departure_time?: string;
  expected_departure_time?: string;
  date?: string;
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

const BASE_URL = '/api/bustimes';

export async function getLiveDepartures(
  atcocode: string,
  signal?: AbortSignal
): Promise<StopDepartures> {
  try {
    const res = await fetch(`${BASE_URL}/api/stops/${atcocode}/`, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!res.ok) {
      console.warn(`Bustimes API error: ${res.status}. Falling back to mock data.`);
      return getMockDepartures(atcocode);
    }

    let data: { name?: string; departures?: BustimesApiDeparture[] };
    try {
      data = await res.json();
    } catch {
      console.warn('Failed to parse bustimes JSON response. Falling back to mock data.');
      return getMockDepartures(atcocode);
    }

    const mappedDepartures: { [line: string]: BusDeparture[] } = {};
    const today = toDateString(new Date());
    const departuresList = data.departures ?? [];

    if (Array.isArray(departuresList)) {
      for (const dep of departuresList) {
        const line = dep.line_name ?? dep.service_number ?? dep.service?.line_name ?? 'Bus';
        const departure: BusDeparture = {
          line,
          direction: dep.destination ?? dep.direction ?? dep.service?.destination ?? 'Unknown',
          aimed_departure_time: dep.aimed_departure_time ?? dep.scheduled_departure_time ?? '00:00',
          expected_departure_time: dep.expected_departure_time ?? dep.aimed_departure_time ?? '00:00',
          best_departure_estimate: dep.expected_departure_time ?? dep.aimed_departure_time ?? '00:00',
          date: dep.date ?? today,
        };

        const bucket = mappedDepartures[line];
        if (bucket) {
          bucket.push(departure);
        } else {
          mappedDepartures[line] = [departure];
        }
      }
    }

    return {
      atcocode,
      name: data.name ?? 'Bus Stop',
      departures: mappedDepartures,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error('Failed to fetch from bustimes.org:', error);
    return getMockDepartures(atcocode);
  }
}

export async function getTimetable(
  atcocode: string,
  _date: string,
  _time: string,
  signal?: AbortSignal
): Promise<TimetableResponse> {
  try {
    const stopData = await getLiveDepartures(atcocode, signal);
    return { departures: stopData.departures };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error('Failed to fetch timetable from bustimes.org:', error);
    const mock = getMockDepartures(atcocode);
    return { departures: mock.departures };
  }
}

function makeDeparture(line: string, direction: string, time: string, d: Date): BusDeparture {
  return {
    line,
    direction,
    aimed_departure_time: time,
    expected_departure_time: time,
    best_departure_estimate: time,
    date: toDateString(d),
  };
}

function getMockDepartures(atcocode: string): StopDepartures {
  console.warn('Serving mock departure data for', atcocode);
  const now = new Date();
  const fmt = (d: Date) => d.toTimeString().substring(0, 5);

  const next1 = new Date(now.getTime() + 15 * 60000);
  const next2 = new Date(now.getTime() + 45 * 60000);
  const last = new Date(now);
  last.setHours(22, 30, 0, 0);
  if (last < now) last.setDate(last.getDate() + 1);

  const name = atcocode.startsWith('2900H') ? 'Hunstanton Bus Station' : "King's Lynn Bus Station";

  if (atcocode.startsWith('2900H')) {
    return {
      atcocode,
      name,
      isMock: true,
      departures: {
        '34': [
          makeDeparture('34', "King's Lynn", fmt(next1), next1),
          makeDeparture('34', "King's Lynn", fmt(next2), next2),
          makeDeparture('34', "King's Lynn", fmt(last), last),
        ],
      },
    };
  }

  return {
    atcocode,
    name,
    isMock: true,
    departures: {
      '3': [
        makeDeparture('3', 'Fairstead Estate', fmt(next1), next1),
        makeDeparture('3', 'Fairstead Estate', fmt(last), last),
      ],
      '4': [
        makeDeparture('4', 'Q.E. Hospital', fmt(next1), next1),
        makeDeparture('4', 'Q.E. Hospital', fmt(last), last),
      ],
      '42': [
        makeDeparture('42', 'Gaywood', fmt(next1), next1),
        makeDeparture('42', 'Gaywood', fmt(last), last),
      ],
      '34': [
        makeDeparture('34', 'South Wootton', fmt(next1), next1),
        makeDeparture('34', 'South Wootton', fmt(last), last),
      ],
      '35': [
        makeDeparture('35', 'North Wootton', fmt(next1), next1),
        makeDeparture('35', 'North Wootton', fmt(last), last),
      ],
      '2': [
        makeDeparture('2', 'West Lynn', fmt(next1), next1),
        makeDeparture('2', 'West Lynn', fmt(last), last),
      ],
    },
  };
}
