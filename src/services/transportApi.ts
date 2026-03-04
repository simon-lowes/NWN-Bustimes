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

export async function getLiveDepartures(
  atcocode: string,
  signal?: AbortSignal,
  live = false
): Promise<StopDepartures> {
  const url = live
    ? `/api/departures/${atcocode}?live=true`
    : `/api/departures/${atcocode}`;

  const res = await fetch(url, { signal });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<StopDepartures>;
}

export async function getAlerts(signal?: AbortSignal): Promise<Alert[]> {
  const res = await fetch('/api/alerts', { signal });

  if (!res.ok) {
    return [];
  }

  return res.json() as Promise<Alert[]>;
}
