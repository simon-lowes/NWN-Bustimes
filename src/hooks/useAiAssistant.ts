import { useRef, useState } from 'react';
import { askBusQuestion, AiResponse } from '../services/aiService';

export function useAiAssistant() {
  const [query, setQuery] = useState('');
  const [aiResponse, setAiResponse] = useState<AiResponse | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleAskQuestion = async (questionToAsk: string, requiresLocation = false) => {
    if (!questionToAsk.trim()) return;

    // Abort any in-flight AI request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setQuery(questionToAsk);
    setIsAiLoading(true);
    setAiError(null);
    setAiResponse(null);

    try {
      let location: { lat: number; lng: number } | undefined;

      if (requiresLocation || questionToAsk.toLowerCase().includes('to town')) {
        try {
          location = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              (err) => reject(err),
              { timeout: 10000 }
            );
          });
        } catch (err) {
          console.warn('Geolocation failed or denied', err);
          questionToAsk += ' (User location unavailable, assume they are in North West Norfolk)';
        }
      }

      const response = await askBusQuestion(questionToAsk, location, controller.signal);
      setAiResponse(response);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setAiError('CONNECTION_TIMEOUT');
    } finally {
      setIsAiLoading(false);
    }
  };

  const clearResponse = () => {
    abortRef.current?.abort();
    setQuery('');
    setAiResponse(null);
    setAiError(null);
    setIsAiLoading(false);
  };

  return { query, setQuery, aiResponse, isAiLoading, aiError, handleAskQuestion, clearResponse };
}
