export interface AiResponse {
  text: string;
  links: Array<{ title: string; uri: string }>;
}

export async function askBusQuestion(
  question: string,
  location?: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<AiResponse> {
  const res = await fetch('/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, location }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`AI request failed: ${res.status}`);
  }

  return res.json() as Promise<AiResponse>;
}
