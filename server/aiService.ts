import { GoogleGenAI } from '@google/genai';

let ai: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export interface AiResponse {
  text: string;
  links: Array<{ title: string; uri: string }>;
}

interface GroundingChunk {
  web?: { uri: string; title: string };
  maps?: { uri: string; title?: string };
}

interface GenerateContentConfig {
  systemInstruction: string;
  tools: Array<{ googleMaps?: Record<string, never> } | { googleSearch?: Record<string, never> }>;
  toolConfig?: {
    retrievalConfig: {
      latLng: { latitude: number; longitude: number };
    };
  };
}

async function getUkTime(): Promise<string> {
  try {
    const res = await fetch('https://worldtimeapi.org/api/timezone/Europe/London', {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json() as { datetime: string };
    const dt = new Date(data.datetime);
    return dt.toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    // Fallback to server clock if API is down
    return new Date().toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

export async function askBusQuestion(
  question: string,
  location?: { lat: number; lng: number }
): Promise<AiResponse> {
  const timeString = await getUkTime();

  const prompt = `
Current Date and Time (UK): ${timeString}
Location Context: North West Norfolk constituency (Hunstanton, King's Lynn, Fairstead Estate, Heacham, Snettisham, Dersingham, etc.).
${location ? `User Location: Latitude ${location.lat}, Longitude ${location.lng}` : 'User location unavailable. Assume they are in North West Norfolk.'}

User Question: ${question}
`;

  const config: GenerateContentConfig = {
    systemInstruction:
      "You are a helpful local transit assistant strictly for the North West Norfolk constituency. Use Google Maps and Search to find the most accurate bus schedules, routes, and connection times within this area. Always format times in 12-hour AM/PM format. Be concise, friendly, and highlight the most important times (like the last bus). If a user asks about routes outside North West Norfolk, politely remind them that you only cover the North West Norfolk constituency.",
    tools: [{ googleMaps: {} }, { googleSearch: {} }],
  };

  if (location) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: location.lat,
          longitude: location.lng,
        },
      },
    };
  }

  const response = await getAi().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config,
  });

  const text = response.text || "Sorry, I couldn't find an answer to that right now.";
  const links: Array<{ title: string; uri: string }> = [];

  const chunks: GroundingChunk[] | undefined =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks as GroundingChunk[] | undefined;

  if (chunks) {
    for (const chunk of chunks) {
      if (chunk.web?.uri && chunk.web?.title) {
        links.push({ title: chunk.web.title, uri: chunk.web.uri });
      }
      if (chunk.maps?.uri) {
        links.push({ title: chunk.maps.title || 'Google Maps Place', uri: chunk.maps.uri });
      }
    }
  }

  // Deduplicate links
  const uniqueLinks = Array.from(new Map(links.map((item) => [item.uri, item])).values());

  return { text, links: uniqueLinks };
}
