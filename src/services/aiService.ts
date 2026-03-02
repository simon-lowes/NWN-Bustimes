import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AiResponse {
  text: string;
  links: Array<{ title: string; uri: string }>;
}

export async function askBusQuestion(question: string, location?: { lat: number; lng: number }): Promise<AiResponse> {
  const now = new Date();
  const timeString = now.toLocaleString('en-GB', { timeZone: 'Europe/London' });
  
  const prompt = `
Current Date and Time (UK): ${timeString}
Location Context: North West Norfolk constituency (Hunstanton, King's Lynn, Fairstead Estate, Heacham, Snettisham, Dersingham, etc.).
${location ? `User Location: Latitude ${location.lat}, Longitude ${location.lng}` : 'User location unavailable. Assume they are in North West Norfolk.'}

User Question: ${question}
`;

  try {
    const config: any = {
      systemInstruction: "You are a helpful local transit assistant strictly for the North West Norfolk constituency. Use Google Maps and Search to find the most accurate bus schedules, routes, and connection times within this area. Always format times in 12-hour AM/PM format. Be concise, friendly, and highlight the most important times (like the last bus). If a user asks about routes outside North West Norfolk, politely remind them that you only cover the North West Norfolk constituency.",
      tools: [{ googleMaps: {} }, { googleSearch: {} }],
    };

    if (location) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: location.lat,
            longitude: location.lng
          }
        }
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config
    });
    
    const text = response.text || "Sorry, I couldn't find an answer to that right now.";
    const links: Array<{ title: string; uri: string }> = [];
    
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          links.push({ title: chunk.web.title, uri: chunk.web.uri });
        }
        if (chunk.maps?.uri) {
          links.push({ title: chunk.maps.title || 'Google Maps Place', uri: chunk.maps.uri });
        }
      });
    }
    
    // Deduplicate links
    const uniqueLinks = Array.from(new Map(links.map(item => [item.uri, item])).values());
    
    return { text, links: uniqueLinks };
  } catch (error) {
    console.error("AI Error:", error);
    throw new Error("Failed to get an answer from the transit assistant.");
  }
}
