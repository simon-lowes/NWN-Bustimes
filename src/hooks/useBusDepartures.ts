import { useEffect, useState } from 'react';
import { getTimetable, BusDeparture, TimetableResponse } from '../services/transportApi';

const STOPS = {
  HUNSTANTON: '2900H0120',
  KINGS_LYNN: '2900K1356',
};

function extract(data: TimetableResponse, destinations: string[]): BusDeparture[] {
  const extracted: BusDeparture[] = [];
  for (const lineBuses of Object.values(data.departures)) {
    extracted.push(...lineBuses);
  }
  return extracted.filter((b) =>
    destinations.some((d) => b.direction.toLowerCase().includes(d.toLowerCase()))
  );
}

export function useBusDepartures(targetDestination: string) {
  const [hunstantonDepartures, setHunstantonDepartures] = useState<BusDeparture[]>([]);
  const [kingsLynnDepartures, setKingsLynnDepartures] = useState<BusDeparture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchBuses() {
      setIsLoading(true);
      setError(null);
      try {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0] ?? '';
        const timeStr = now.toTimeString().substring(0, 5);

        const fetchForStop = async (atcocode: string, destinations: string[]) => {
          const res = await getTimetable(atcocode, dateStr, timeStr, controller.signal);
          let buses = extract(res, destinations);

          if (buses.length === 0) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0] ?? '';
            const tomorrowRes = await getTimetable(atcocode, tomorrowStr, '03:00', controller.signal);
            buses = extract(tomorrowRes, destinations);
          }

          buses.sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.aimed_departure_time}`);
            const dateB = new Date(`${b.date}T${b.aimed_departure_time}`);
            return dateA.getTime() - dateB.getTime();
          });

          return buses;
        };

        const hunstantonBuses = await fetchForStop(STOPS.HUNSTANTON, ['lynn', 'king']);
        setHunstantonDepartures(hunstantonBuses);

        const kingsLynnBuses = await fetchForStop(STOPS.KINGS_LYNN, [targetDestination]);
        setKingsLynnDepartures(kingsLynnBuses);

        setLastSync(new Date().toLocaleTimeString('en-GB', { hour12: true }));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('ERR_FETCH_FAIL');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    void fetchBuses();

    const interval = setInterval(() => void fetchBuses(), 5 * 60 * 1000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [targetDestination]);

  return { hunstantonDepartures, kingsLynnDepartures, isLoading, error, lastSync };
}
