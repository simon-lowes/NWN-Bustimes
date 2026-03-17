export interface AiResponse {
  text: string;
  links: Array<{ title: string; uri: string }>;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export async function askBusQuestion(
  question: string,
  history?: ChatMessage[],
  location?: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<AiResponse> {
  const res = await fetch('/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history, location }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`AI request failed: ${res.status}`);
  }

  return res.json() as Promise<AiResponse>;
}
