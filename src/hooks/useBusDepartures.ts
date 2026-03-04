import { useEffect, useState } from 'react';
import { getLiveDepartures, BusDeparture } from '../services/transportApi';

// Hunstanton departures go from Stand A and Stand B (Bay 1 is arrivals-only)
const HUNSTANTON_STANDS = ['2900H5315', '2900H5314'];

// Each dropdown destination maps to the King's Lynn stands that serve it.
// Stand selection IS the filter — nextbuses directions show terminus names
// (e.g. "Kings Lynn, Transport Interchange") not neighborhoods.
const DESTINATION_STOPS: Record<string, string[]> = {
  Fairstead:       ['2900K13143'],           // Stand G: 41, 42
  Hospital:        ['2900K13141', '2900K13144'], // Stand E: 33-36, Stand H: 4, 5, 32
  Gaywood:         ['2900K13144'],           // Stand H: 3H, 4, 5, 32, 47
  'South Wootton': ['2900K13141'],           // Stand E: 33, 34, 35, 36
  'North Wootton': ['2900K13141'],           // Stand E: 33, 34, 35, 36
  'West Lynn':     ['2900K13139'],           // Stand C: 2, 3
};

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
        // Hunstanton: fetch both departure stands in parallel, filter for King's Lynn bound
        const hunstantonResults = await Promise.all(
          HUNSTANTON_STANDS.map((code) => getLiveDepartures(code, controller.signal).catch(() => null))
        );
        const hunstantonBuses: BusDeparture[] = [];
        for (const result of hunstantonResults) {
          if (result) {
            for (const lineBuses of Object.values(result.departures)) {
              for (const dep of lineBuses) {
                if (dep.direction.toLowerCase().includes('lynn') || dep.direction.toLowerCase().includes('king')) {
                  hunstantonBuses.push(dep);
                }
              }
            }
          }
        }
        hunstantonBuses.sort((a, b) => a.aimed_departure_time.localeCompare(b.aimed_departure_time));
        setHunstantonDepartures(hunstantonBuses);

        // King's Lynn: fetch relevant stands in parallel, merge results.
        // No direction filter needed — stand selection determines the destination.
        const stands = DESTINATION_STOPS[targetDestination] ?? [];
        const standResults = await Promise.all(
          stands.map((code) => getLiveDepartures(code, controller.signal).catch(() => null))
        );

        const allKLBuses: BusDeparture[] = [];
        for (const result of standResults) {
          if (result) {
            for (const lineBuses of Object.values(result.departures)) {
              allKLBuses.push(...lineBuses);
            }
          }
        }
        allKLBuses.sort((a, b) => a.aimed_departure_time.localeCompare(b.aimed_departure_time));
        setKingsLynnDepartures(allKLBuses);

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

    const interval = setInterval(() => void fetchBuses(), 60_000); // poll every 60s (matches cache TTL)
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [targetDestination]);

  return { hunstantonDepartures, kingsLynnDepartures, isLoading, error, lastSync };
}
