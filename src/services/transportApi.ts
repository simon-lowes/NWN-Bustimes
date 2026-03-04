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

export async function getLiveDepartures(
  atcocode: string,
  signal?: AbortSignal
): Promise<StopDepartures> {
  const res = await fetch(`/api/departures/${atcocode}`, { signal });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<StopDepartures>;
}
