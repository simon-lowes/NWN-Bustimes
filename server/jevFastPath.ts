// Jev (TypeSafe AI) fast path for "next/last bus" questions.
// Jev judges (which stand, which intent); code decides and answers from the timetable.
// OFF unless TYPESAFE_API_KEY is set. Any failure or low confidence returns null,
// and the caller falls back to Gemini (today's behaviour).
import { getDepartures, STOP_NAMES, STAND_DESTINATIONS, type BusDeparture } from './departures.js';
import type { AiResponse } from './aiService.js';

export const JEV_THRESHOLDS = { stand: 0.85, intent: 0.85 };
const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

type Choice = { choice: string; probabilities?: Record<string, number> };

export function buildJevRequest(question: string) {
  const stands = Object.keys(STOP_NAMES).map((code) => `${code}: ${STOP_NAMES[code]} - ${STAND_DESTINATIONS[code] ?? ''}`);
  return {
    model: process.env.JEV_MODEL || 'jev-latest',
    state: { question, stands },
    questions: {
      stand: {
        type: 'choice',
        instructions: 'Which stand in `stands` does the passenger in `question` need to catch their bus from? Answer the stand code, or "unsure" if the question does not pin down one stand.',
        criteria: [...Object.keys(STOP_NAMES), 'unsure'],
      },
      intent: {
        type: 'choice',
        instructions: 'Is `question` asking only for the next bus, only for the last bus today, or something else?',
        criteria: ['next', 'last', 'other'],
      },
    },
  };
}

function confident(c: Choice | undefined, min: number): string | null {
  if (!c || typeof c.choice !== 'string') return null;
  const p = c.probabilities?.[c.choice];
  return typeof p === 'number' && p >= min ? c.choice : null;
}

export function pickDeparture(deps: BusDeparture[], intent: 'next' | 'last', now: Date): BusDeparture | null {
  const future = deps
    .filter((d) => new Date(d.best_departure_estimate || d.aimed_departure_time).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.best_departure_estimate || a.aimed_departure_time).getTime() - new Date(b.best_departure_estimate || b.aimed_departure_time).getTime());
  if (!future.length) return null;
  return (intent === 'next' ? future[0] : future[future.length - 1]) ?? null;
}

export async function tryJevFastPath(question: string): Promise<AiResponse | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(JEV_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(buildJevRequest(question)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { answers?: Record<string, Choice> } & Record<string, Choice>;
    const answers = body.answers ?? body;
    const stand = confident(answers.stand, JEV_THRESHOLDS.stand);
    const intent = confident(answers.intent, JEV_THRESHOLDS.intent);
    if (!stand || stand === 'unsure' || !(stand in STOP_NAMES)) return null;
    if (intent !== 'next' && intent !== 'last') return null;
    const data = await getDepartures(stand);
    const all = Object.values(data.departures).flat();
    const dep = pickDeparture(all, intent, new Date());
    if (!dep) return null; // empty may mean data failed to load: let Gemini handle the wording
    const t = new Date(dep.best_departure_estimate || dep.aimed_departure_time)
      .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
    const label = intent === 'next' ? 'The next scheduled bus' : 'The last scheduled bus today';
    return { text: `${label} from ${STOP_NAMES[stand]} is the ${dep.line} to ${dep.direction} at ${t}.`, links: [] };
  } catch {
    return null;
  }
}
