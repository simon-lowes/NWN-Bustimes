import { useEffect, useState, useCallback, useRef } from 'react';
import { getLiveDepartures, getAlerts, BusDeparture, Alert } from '../services/transportApi';

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
  const [hunstantonCurrentIndex, setHunstantonCurrentIndex] = useState(0);
  const [kingsLynnCurrentIndex, setKingsLynnCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const controllerRef = useRef<AbortController | null>(null);

  function findCurrentIndex(departures: BusDeparture[]): number {
    const now = new Date().toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const idx = departures.findIndex((d) => d.best_departure_estimate >= now);
    return idx >= 0 ? idx : departures.length - 1;
  }

  const fetchBuses = useCallback(async () => {
    // Abort any in-flight request
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      // Hunstanton: fetch both departure stands in parallel, filter for King's Lynn bound
      const hunstantonResults = await Promise.all(
        HUNSTANTON_STANDS.map((code) =>
          getLiveDepartures(code, controller.signal, { full: true }).catch(() => null)
        )
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
      setHunstantonCurrentIndex(findCurrentIndex(hunstantonBuses));

      // King's Lynn: fetch relevant stands in parallel, merge results.
      // No direction filter needed — stand selection determines the destination.
      const stands = DESTINATION_STOPS[targetDestination] ?? [];
      const standResults = await Promise.all(
        stands.map((code) =>
          getLiveDepartures(code, controller.signal, { full: true }).catch(() => null)
        )
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
      setKingsLynnCurrentIndex(findCurrentIndex(allKLBuses));

      setLastSync(new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Could not load bus times. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [targetDestination]);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getAlerts();
      setAlerts(data);
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  // On mount + destination change: fetch timetable baseline, then live overlay
  useEffect(() => {
    void fetchBuses();
    void fetchAlerts();

    return () => {
      controllerRef.current?.abort();
    };
  }, [fetchBuses, fetchAlerts]);

  const refresh = useCallback(() => {
    void fetchBuses();
    void fetchAlerts();
  }, [fetchBuses, fetchAlerts]);

  return { hunstantonDepartures, kingsLynnDepartures, hunstantonCurrentIndex, kingsLynnCurrentIndex, isLoading, error, lastSync, alerts, refresh };
}
