import { useState, useEffect, useRef } from 'react';
import { BusCard } from './components/BusCard';
import { useBusDepartures } from './hooks/useBusDepartures';
import { useAiAssistant } from './hooks/useAiAssistant';
import Markdown from 'react-markdown';
import { motion } from 'motion/react';

const PRESETS = [
  "When is the next bus to town?",
  "When is the next bus from King's Lynn bus station to Hunstanton?",
  "When is the next bus from Hunstanton to King's Lynn?",
  "When is the last bus from Hunstanton which will connect with the last bus to Fairstead Estate?"
];

export default function App() {
  const [targetDestination, setTargetDestination] = useState('Fairstead');
  const { hunstantonDepartures, kingsLynnDepartures, isLoading, error, lastSync, alerts, refresh } =
    useBusDepartures(targetDestination);
  const { query, setQuery, aiResponse, isAiLoading, aiError, handleAskQuestion, clearResponse } =
    useAiAssistant();

  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aiResponse && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [aiResponse]);

  return (
    <div className="min-h-screen bg-transit-black text-transit-white selection:bg-transit-yellow selection:text-transit-black p-4 md:p-8 lg:p-12 font-body">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mb-12 border-b-4 border-transit-white pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-6"
      >
        <div>
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-display uppercase leading-[0.85] tracking-tight hover:text-transit-yellow transition-colors duration-300">
            LAST BUS<br/>CONNECTOR
          </h1>
          <div className="font-mono text-transit-yellow mt-6 text-sm md:text-base flex flex-wrap items-center gap-4 tracking-widest">
            <span className="bg-transit-yellow text-transit-black px-2 py-1 font-bold animate-pulse">SYS_ACTIVE</span>
            <span>NW NORFOLK TRANSIT GRID</span>
          </div>
        </div>
        <div className="text-left md:text-right font-mono text-xs md:text-sm text-transit-white/50 max-w-xs uppercase tracking-widest leading-relaxed">
          <div className="flex items-center gap-3 justify-start md:justify-end mb-2">
            {lastSync ? (
              <span className="text-transit-yellow">LAST_SYNC: {lastSync}</span>
            ) : (
              <span>CONNECTING_TO_GRID...</span>
            )}
            <button
              onClick={() => { clearResponse(); refresh(); }}
              disabled={isLoading}
              className="text-transit-black bg-transit-yellow hover:bg-transit-white px-2 py-0.5 font-bold text-xs transition-colors disabled:opacity-50"
            >
              REFRESH
            </button>
          </div>
          Realtime routing and connection protocol for Hunstanton and King's Lynn terminals.
        </div>
      </motion.header>

      <main className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12 max-w-[1800px] mx-auto">

        {/* Left Column: The Boards */}
        <div className="xl:col-span-7 flex flex-col gap-8">
          {alerts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="brutal-border p-4 bg-transit-orange text-transit-black font-mono text-sm uppercase tracking-widest space-y-2"
            >
              <div className="font-bold text-base">ALERT_DETECTED:</div>
              {alerts.map((alert, idx) => (
                <div key={idx}>{`>`} {alert.message}</div>
              ))}
            </motion.div>
          )}

          <BusCard
            title="Hunstanton"
            subtitle="King's Lynn"
            departures={hunstantonDepartures}
            isLoading={isLoading}
            error={error}
            delay={0.1}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="brutal-border p-6 bg-transit-white text-transit-black flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between brutal-shadow"
          >
            <label htmlFor="destination-select" className="font-display text-4xl md:text-5xl uppercase leading-none tracking-tight">
              CONNECTION<br/>TARGET:
            </label>
            <div className="relative w-full sm:w-auto">
              <select
                id="destination-select"
                value={targetDestination}
                onChange={(e) => setTargetDestination(e.target.value)}
                className="appearance-none w-full sm:w-64 bg-transparent border-b-4 border-transit-black font-mono text-2xl md:text-3xl focus:outline-none focus:bg-transit-yellow/30 p-2 pr-10 rounded-none cursor-pointer uppercase tracking-widest transition-colors"
              >
                <option value="Fairstead">FAIRSTEAD ESTATE</option>
                <option value="Hospital">Q.E. HOSPITAL</option>
                <option value="Gaywood">GAYWOOD</option>
                <option value="South Wootton">SOUTH WOOTTON</option>
                <option value="North Wootton">NORTH WOOTTON</option>
                <option value="West Lynn">WEST LYNN</option>
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none font-mono text-xl">
                ▼
              </div>
            </div>
          </motion.div>

          <BusCard
            title="King's Lynn"
            subtitle={targetDestination}
            departures={kingsLynnDepartures}
            isLoading={isLoading}
            error={error}
            delay={0.3}
          />
        </div>

        {/* Right Column: AI Terminal */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="xl:col-span-5 h-[80dvh] xl:h-auto min-h-[600px] flex flex-col"
        >
          <div className="brutal-border flex-1 flex flex-col bg-[#050505] relative overflow-hidden brutal-shadow-orange">
            <div className="crt-scanline"></div>

            {/* Terminal Header */}
            <div className="bg-transit-white text-transit-black p-3 font-mono font-bold flex justify-between items-center relative z-10">
              <span className="tracking-widest">TERMINAL // AI_ASSIST</span>
              <span className="w-3 h-3 bg-transit-orange rounded-full animate-pulse"></span>
            </div>

            {/* Terminal Body */}
            <div className="p-6 flex-1 flex flex-col relative z-10 overflow-y-auto">
              <div className="font-mono text-sm md:text-base text-transit-white/60 mb-8 space-y-1 tracking-widest uppercase">
                <p>{'>'} INITIALIZING SMART TRANSIT ASSISTANT...</p>
                <p>{'>'} LOADED CONSTITUENCY DATA.</p>
                <p>{'>'} AWAITING QUERY.</p>
              </div>

              {!aiResponse && !isAiLoading && !aiError && (
                <div className="flex flex-wrap gap-3 mb-8">
                  {PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAskQuestion(preset, idx === 0)}
                      aria-label={preset}
                      className="font-mono text-xs md:text-sm border-2 border-transit-white/30 hover:border-transit-yellow hover:text-transit-yellow hover:bg-transit-yellow/10 p-2 text-left transition-all duration-200 uppercase tracking-wider"
                    >
                      [{idx + 1}] {preset}
                    </button>
                  ))}
                </div>
              )}

              {/* Chat Area */}
              <div ref={chatRef} className="flex-1 overflow-y-auto mb-6 pr-4 space-y-6 font-mono text-sm md:text-base terminal-scroll">
                {aiError && (
                  <div className="text-transit-orange tracking-widest" role="alert">{'>'} ERR: {aiError}</div>
                )}

                {aiResponse && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-l-4 border-transit-yellow pl-4"
                  >
                    <div className="text-transit-yellow mb-4 font-bold tracking-widest">{'>'} RESPONSE_GENERATED:</div>
                    <div className="prose prose-invert prose-p:leading-relaxed prose-a:text-transit-yellow hover:prose-a:text-transit-white max-w-none font-mono text-sm md:text-base tracking-wide">
                      <Markdown>{aiResponse.text}</Markdown>
                    </div>

                    {aiResponse.links && aiResponse.links.length > 0 && (
                      <div className="mt-8 pt-4 border-t-2 border-dashed border-transit-white/20">
                        <div className="text-transit-white/50 mb-3 tracking-widest">{'>'} SOURCES:</div>
                        <ul className="space-y-3">
                          {aiResponse.links.map((link, idx) => (
                            <li key={idx}>
                              <a
                                href={link.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-transit-yellow hover:text-transit-white hover:bg-transit-white/10 px-2 py-1 -ml-2 transition-colors truncate block"
                              >
                                [{idx + 1}] {link.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </motion.div>
                )}

                {isAiLoading && (
                  <div className="text-transit-yellow animate-pulse tracking-widest" role="status" aria-live="polite">{'>'} PROCESSING_QUERY...</div>
                )}
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => { e.preventDefault(); handleAskQuestion(query); }}
                className="mt-auto relative flex items-center border-t-4 border-transit-white/20 pt-6"
              >
                <label htmlFor="ai-query" className="sr-only">Ask a bus question</label>
                <span className="text-transit-yellow mr-3 font-bold text-xl">{'>'}</span>
                <input
                  id="ai-query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ENTER_QUERY..."
                  className="w-full bg-transparent font-mono text-lg md:text-xl text-transit-white focus:outline-none placeholder:text-transit-white/20 uppercase tracking-widest"
                />
                <button
                  type="submit"
                  disabled={isAiLoading || !query.trim()}
                  className="font-mono font-bold text-xl text-transit-black bg-transit-yellow hover:bg-transit-white px-4 py-2 transition-colors disabled:opacity-50 disabled:hover:bg-transit-yellow ml-4"
                >
                  [EXEC]
                </button>
              </form>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
