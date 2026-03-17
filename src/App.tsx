import { useState, useEffect, useRef } from 'react';
import { BusCard } from './components/BusCard';
import { useBusDepartures } from './hooks/useBusDepartures';
import { useAiAssistant } from './hooks/useAiAssistant';
import Markdown from 'react-markdown';
import { motion } from 'motion/react';

function getGreeting(): string {
  const hour = parseInt(
    new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }),
    10,
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const PRESETS = [
  "When is the next bus to town?",
  "When is the next bus from King's Lynn bus station to Hunstanton?",
  "When is the next bus from Hunstanton to King's Lynn?",
  "When is the last bus from Hunstanton which will connect with the last bus to Fairstead Estate?"
];

export default function App() {
  const [targetDestination, setTargetDestination] = useState('Fairstead');
  const { hunstantonDepartures, kingsLynnDepartures, hunstantonCurrentIndex, kingsLynnCurrentIndex, isLoading, error, lastSync, alerts, refresh } =
    useBusDepartures(targetDestination);
  const { query, setQuery, aiResponse, isAiLoading, aiError, handleAskQuestion, clearResponse } =
    useAiAssistant();

  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aiResponse && chatRef.current) {
      chatRef.current.scrollTop = 0;
    }
  }, [aiResponse]);

  return (
    <div className="min-h-screen p-6 md:p-8 font-body">
      <div className="max-w-[600px] mx-auto flex flex-col gap-8">

        {/* 1. HEADER */}
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center pt-6"
        >
          <h1 className="text-4xl md:text-5xl font-display text-brown leading-tight">
            {getGreeting()}!<br/>Here are your bus times.
          </h1>
          <p className="text-2xl text-brown/80 mt-3">Hunstanton and King's Lynn buses</p>
          <button
            onClick={() => { clearResponse(); refresh(); }}
            disabled={isLoading}
            className="mt-6 bg-amber text-brown font-medium text-xl rounded-2xl px-6 py-4 w-full flex items-center justify-center gap-3 shadow-[0_4px_12px_rgba(232,161,76,0.3)] active:scale-[0.98] active:bg-amber-dark transition-all disabled:opacity-50"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Refresh bus times
          </button>
          <p className="text-lg text-brown/60 mt-3">
            {lastSync ? `Up to date as of ${lastSync}` : 'Checking bus times...'}
          </p>
        </motion.header>

        {/* 2. ALERTS */}
        {alerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-coral text-white p-6 rounded-[20px] font-medium flex gap-4 items-start shadow-[0_8px_24px_rgba(224,122,95,0.2)]"
          >
            <span className="text-3xl leading-none shrink-0">⚠️</span>
            <div className="space-y-2">
              {alerts.map((alert, idx) => (
                <p key={idx} className={idx === 0 ? "font-semibold text-xl" : "text-lg opacity-95"}>{alert.message}</p>
              ))}
            </div>
          </motion.div>
        )}

        {/* 3. HUNSTANTON BUS CARD */}
        <BusCard
          title="Hunstanton"
          subtitle="King's Lynn"
          departures={hunstantonDepartures}
          currentIndex={hunstantonCurrentIndex}
          isLoading={isLoading}
          error={error}
          delay={0.1}
        />

        {/* 4. DESTINATION SELECTOR */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h2 className="text-3xl font-display text-brown mb-2">Where are you heading?</h2>
          <p className="text-xl text-brown/80 mb-4">Pick your destination and we'll find your connecting bus.</p>
          <select
            value={targetDestination}
            onChange={(e) => setTargetDestination(e.target.value)}
            className="w-full font-body text-xl text-brown bg-cream border-2 border-amber rounded-2xl p-4 pr-14 min-h-[64px] appearance-none focus:outline-none focus:border-brown focus:bg-white cursor-pointer"
            style={{backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234A3728' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 24px center', backgroundSize: '24px'}}
          >
            <option value="Fairstead">Fairstead Estate</option>
            <option value="Hospital">Q.E. Hospital</option>
            <option value="Gaywood">Gaywood</option>
            <option value="South Wootton">South Wootton</option>
            <option value="North Wootton">North Wootton</option>
            <option value="West Lynn">West Lynn</option>
          </select>
        </motion.div>

        {/* 5. KING'S LYNN BUS CARD */}
        <BusCard
          title="King's Lynn"
          subtitle={targetDestination}
          departures={kingsLynnDepartures}
          currentIndex={kingsLynnCurrentIndex}
          isLoading={isLoading}
          error={error}
          delay={0.3}
        />

        {/* 6. AI HELPER */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="card"
        >
          <h2 className="text-3xl font-display text-brown mb-2">Chat with your bus helper</h2>
          <p className="text-xl text-brown/80 mb-6">Not sure about something? Tap a question below or ask your own.</p>

          {/* Preset buttons */}
          {!aiResponse && !isAiLoading && !aiError && (
            <div className="flex flex-col gap-4 mb-6">
              {PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAskQuestion(preset, idx === 0)}
                  className="bg-cream text-brown border-2 border-peach rounded-2xl px-6 py-5 text-left text-lg font-medium active:bg-peach active:border-amber transition-colors"
                >
                  {"\uD83D\uDCAC"} "{preset}"
                </button>
              ))}
            </div>
          )}

          {/* Chat display */}
          <div ref={chatRef} className="overflow-y-auto max-h-[400px] space-y-4 chat-scroll">
            {aiError && (
              <div className="chat-response text-coral font-medium" role="alert">{aiError}</div>
            )}

            {aiResponse && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="chat-response"
              >
                <div className="prose prose-lg prose-stone max-w-none">
                  <Markdown>{aiResponse.text}</Markdown>
                </div>

                {aiResponse.links && aiResponse.links.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-brown/10">
                    <p className="text-brown/50 text-sm mb-2">Sources:</p>
                    <ul className="space-y-2">
                      {aiResponse.links.map((link, idx) => (
                        <li key={idx}>
                          <a
                            href={link.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber hover:text-brown underline transition-colors"
                          >
                            {link.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            )}

            {isAiLoading && (
              <div className="text-amber font-medium text-xl animate-pulse" role="status" aria-live="polite">
                <span className="inline-block animate-spin mr-3">{"\u2600\uFE0F"}</span> Finding that out for you...
              </div>
            )}
          </div>

          {/* Input form */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleAskQuestion(query); }}
            className="flex flex-col sm:flex-row gap-4 mt-6"
          >
            <label htmlFor="ai-query" className="sr-only">Ask a bus question</label>
            <input
              id="ai-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask me anything about the buses..."
              className="flex-1 font-body text-xl text-brown bg-cream border-2 border-amber rounded-2xl px-6 py-4 min-h-[64px] focus:outline-none focus:border-brown focus:bg-white"
            />
            <button
              type="submit"
              disabled={isAiLoading || !query.trim()}
              className="bg-amber text-brown font-semibold text-xl rounded-2xl px-8 py-4 shadow-[0_4px_12px_rgba(232,161,76,0.3)] active:scale-[0.98] active:bg-amber-dark transition-all disabled:opacity-50"
            >
              Ask
            </button>
          </form>
        </motion.div>

        {/* 7. FOOTER */}
        <footer className="text-center pb-12 text-lg text-brown/50">
          Your bus helper &mdash; Hunstanton &amp; King&apos;s Lynn
        </footer>

      </div>
    </div>
  );
}
