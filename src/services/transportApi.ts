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

export interface TimetableResponse {
  departures: {
    [line: string]: BusDeparture[];
  };
}

// Using the proxy defined in vite.config.ts
const BASE_URL = '/bustimes-api';

export async function getLiveDepartures(atcocode: string): Promise<StopDepartures> {
  try {
    // Use the official API endpoint with trailing slash
    const res = await fetch(`${BASE_URL}/api/stops/${atcocode}/`, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      console.warn(`Bustimes API error: ${res.status}. Falling back to mock data.`);
      return getMockDepartures(atcocode);
    }
    
    const data = await res.json();
    
    // Map bustimes.org API format to our internal format
    // The API response usually has a 'departures' field which is a list of objects
    const mappedDepartures: { [line: string]: BusDeparture[] } = {};
    const today = new Date().toISOString().split('T')[0];

    // The API might return departures directly or nested
    const departuresList = data.departures || [];

    if (Array.isArray(departuresList)) {
      departuresList.forEach((dep: any) => {
        const line = dep.line_name || dep.service_number || dep.service?.line_name || 'Bus';
        const departure: BusDeparture = {
          line: line,
          direction: dep.destination || dep.direction || dep.service?.destination || 'Unknown',
          aimed_departure_time: dep.aimed_departure_time || dep.scheduled_departure_time || '00:00',
          expected_departure_time: dep.expected_departure_time || dep.aimed_departure_time || '00:00',
          best_departure_estimate: dep.expected_departure_time || dep.aimed_departure_time || '00:00',
          date: dep.date || today
        };
        
        if (!mappedDepartures[line]) {
          mappedDepartures[line] = [];
        }
        mappedDepartures[line].push(departure);
      });
    }
    
    return {
      atcocode,
      name: data.name || 'Bus Stop',
      departures: mappedDepartures
    };
  } catch (error) {
    console.error('Failed to fetch from bustimes.org:', error);
    return getMockDepartures(atcocode);
  }
}

export async function getTimetable(atcocode: string, date: string, time: string): Promise<TimetableResponse> {
  // bustimes.org doesn't have a direct "timetable at this specific time" JSON endpoint like TransportAPI
  // but we can fetch the stop's departures and filter them.
  // For a full day's timetable, we'd usually fetch a different endpoint, but for this app's needs,
  // getLiveDepartures is often sufficient if it returns enough upcoming buses.
  
  try {
    const stopData = await getLiveDepartures(atcocode);
    return {
      departures: stopData.departures
    };
  } catch (error) {
    console.error('Failed to fetch timetable from bustimes.org:', error);
    const mock = getMockDepartures(atcocode);
    return { departures: mock.departures };
  }
}

// Mock data as fallback
function getMockDepartures(atcocode: string): StopDepartures {
  const now = new Date();
  const formatTime = (d: Date) => d.toTimeString().substring(0, 5);
  
  const next1 = new Date(now.getTime() + 15 * 60000);
  const next2 = new Date(now.getTime() + 45 * 60000);
  const last = new Date(now);
  last.setHours(22, 30, 0, 0); // 10:30 PM
  
  if (last < now) {
    last.setDate(last.getDate() + 1);
  }

  const name = atcocode.startsWith('2900H') ? 'Hunstanton Bus Station' : 'King\'s Lynn Bus Station';
  
  if (atcocode.startsWith('2900H')) {
    return {
      atcocode,
      name,
      departures: {
        '34': [
          { line: '34', direction: 'King\'s Lynn', aimed_departure_time: formatTime(next1), expected_departure_time: formatTime(next1), best_departure_estimate: formatTime(next1), date: next1.toISOString().split('T')[0] },
          { line: '34', direction: 'King\'s Lynn', aimed_departure_time: formatTime(next2), expected_departure_time: formatTime(next2), best_departure_estimate: formatTime(next2), date: next2.toISOString().split('T')[0] },
          { line: '34', direction: 'King\'s Lynn', aimed_departure_time: formatTime(last), expected_departure_time: formatTime(last), best_departure_estimate: formatTime(last), date: last.toISOString().split('T')[0] }
        ]
      }
    };
  }

  return {
    atcocode,
    name,
    departures: {
      '3': [
        { line: '3', direction: 'Fairstead Estate', aimed_departure_time: formatTime(next1), expected_departure_time: formatTime(next1), best_departure_estimate: formatTime(next1), date: next1.toISOString().split('T')[0] },
        { line: '3', direction: 'Fairstead Estate', aimed_departure_time: formatTime(last), expected_departure_time: formatTime(last), best_departure_estimate: formatTime(last), date: last.toISOString().split('T')[0] }
      ],
      '4': [
        { line: '4', direction: 'Q.E. Hospital', aimed_departure_time: formatTime(next1), expected_departure_time: formatTime(next1), best_departure_estimate: formatTime(next1), date: next1.toISOString().split('T')[0] },
        { line: '4', direction: 'Q.E. Hospital', aimed_departure_time: formatTime(last), expected_departure_time: formatTime(last), best_departure_estimate: formatTime(last), date: last.toISOString().split('T')[0] }
      ],
      '42': [
        { line: '42', direction: 'Gaywood', aimed_departure_time: formatTime(next1), expected_departure_time: formatTime(next1), best_departure_estimate: formatTime(next1), date: next1.toISOString().split('T')[0] },
        { line: '42', direction: 'Gaywood', aimed_departure_time: formatTime(last), expected_departure_time: formatTime(last), best_departure_estimate: formatTime(last), date: last.toISOString().split('T')[0] }
      ],
      '34': [
        { line: '34', direction: 'South Wootton', aimed_departure_time: formatTime(next1), expected_departure_time: formatTime(next1), best_departure_estimate: formatTime(next1), date: next1.toISOString().split('T')[0] },
        { line: '34', direction: 'South Wootton', aimed_departure_time: formatTime(last), expected_departure_time: formatTime(last), best_departure_estimate: formatTime(last), date: last.toISOString().split('T')[0] }
      ],
      '35': [
        { line: '35', direction: 'North Wootton', aimed_departure_time: formatTime(next1), expected_departure_time: formatTime(next1), best_departure_estimate: formatTime(next1), date: next1.toISOString().split('T')[0] },
        { line: '35', direction: 'North Wootton', aimed_departure_time: formatTime(last), expected_departure_time: formatTime(last), best_departure_estimate: formatTime(last), date: last.toISOString().split('T')[0] }
      ],
      '2': [
        { line: '2', direction: 'West Lynn', aimed_departure_time: formatTime(next1), expected_departure_time: formatTime(next1), best_departure_estimate: formatTime(next1), date: next1.toISOString().split('T')[0] },
        { line: '2', direction: 'West Lynn', aimed_departure_time: formatTime(last), expected_departure_time: formatTime(last), best_departure_estimate: formatTime(last), date: last.toISOString().split('T')[0] }
      ]
    }
  };
}
