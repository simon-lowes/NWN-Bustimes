import { useState, useEffect } from 'react';
import { BusDeparture } from '../services/transportApi';
import { formatTime12h } from '../utils/time';
import { motion } from 'motion/react';

interface BusCardProps {
  title: string;
  subtitle: string;
  departures: BusDeparture[];
  currentIndex: number;
  isLoading: boolean;
  error: string | null;
  delay?: number;
}

export function BusCard({ title, subtitle, departures, currentIndex, isLoading, error, delay = 0 }: BusCardProps) {
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);

  // Reset to current when data refreshes
  useEffect(() => {
    setSelectedIndex(currentIndex);
  }, [currentIndex, departures]);

  const selectedBus = departures[selectedIndex];
  const lastBus = departures.length > 1 ? departures[departures.length - 1] : undefined;
  const today = new Date().toISOString().split('T')[0] ?? '';

  const canGoBack = selectedIndex > 0;
  const canGoForward = selectedIndex < departures.length - 1;

  // Label changes based on position
  let timeLabel: string;
  if (selectedIndex === currentIndex) {
    timeLabel = 'Your next bus leaves at';
  } else if (selectedIndex < currentIndex) {
    timeLabel = 'Earlier bus was at';
  } else {
    timeLabel = 'A later bus leaves at';
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className="card"
    >
      <h2 className="text-3xl font-display text-brown mb-1">Your bus from {title}</h2>
      <p className="text-xl text-brown/80 mb-6">This bus takes you to {subtitle}.</p>

      <div>
        {isLoading ? (
          <div className="text-amber font-medium text-xl animate-pulse py-8" role="status" aria-live="polite">
            <span className="inline-block animate-spin mr-3">☀️</span> Checking bus times...
          </div>
        ) : error ? (
          <div className="text-coral font-medium text-xl py-8" role="alert">{error}</div>
        ) : departures.length === 0 ? (
          <div className="text-brown/50 text-xl py-8">No buses running right now.</div>
        ) : (
          <div>
            {selectedBus && (
              <div>
                <p className="text-xl text-brown/80 mb-2 flex items-center gap-2">
                  {timeLabel}
                  {selectedBus.date > today && (
                    <span className="bg-amber text-brown text-sm font-semibold px-3 py-1 rounded-full">Tomorrow</span>
                  )}
                </p>

                {/* Time display with arrow navigation */}
                <div className="flex items-center gap-4 my-2">
                  <button
                    onClick={() => setSelectedIndex((i) => i - 1)}
                    disabled={!canGoBack}
                    aria-label="Earlier departure"
                    className="w-14 h-14 flex items-center justify-center rounded-full bg-cream border-2 border-peach text-brown text-2xl font-bold active:bg-peach transition-colors disabled:opacity-30 disabled:cursor-default shrink-0"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                  </button>

                  <div className="flex-1 text-center">
                    <div className="text-6xl font-bold text-amber leading-tight font-body">
                      {formatTime12h(selectedBus.best_departure_estimate)}
                    </div>
                    <div className="inline-block mt-3 bg-cream text-brown text-2xl font-semibold px-5 py-3 rounded-2xl border-2 border-peach">
                      Bus number {selectedBus.line}
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedIndex((i) => i + 1)}
                    disabled={!canGoForward}
                    aria-label="Later departure"
                    className="w-14 h-14 flex items-center justify-center rounded-full bg-cream border-2 border-peach text-brown text-2xl font-bold active:bg-peach transition-colors disabled:opacity-30 disabled:cursor-default shrink-0"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                </div>

                {/* Position indicator */}
                <p className="text-center text-sm text-brown/50 mt-2">
                  {selectedIndex + 1} of {departures.length} buses today
                </p>
              </div>
            )}

            {lastBus && lastBus !== selectedBus && (
              <div className="last-bus-callout">
                <p className="text-xl font-medium text-brown m-0 flex items-center gap-2">
                  The last bus today leaves at {formatTime12h(lastBus.best_departure_estimate)} — Bus {lastBus.line}
                  {lastBus.date > today && (
                    <span className="bg-coral text-white text-sm font-semibold px-3 py-1 rounded-full">Tomorrow</span>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
