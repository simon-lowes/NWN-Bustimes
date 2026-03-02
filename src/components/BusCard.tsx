import React from 'react';
import { BusDeparture } from '../services/transportApi';
import { motion } from 'motion/react';

interface BusCardProps {
  title: string;
  subtitle: string;
  departures: BusDeparture[];
  isLoading: boolean;
  error: string | null;
  delay?: number;
}

export function BusCard({ title, subtitle, departures, isLoading, error, delay = 0 }: BusCardProps) {
  // Convert 24h to 12h format
  const formatTime12h = (time24: string) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  const nextBus = departures.length > 0 ? departures[0] : null;
  const lastBus = departures.length > 1 ? departures[departures.length - 1] : null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className="bg-transit-black brutal-border p-6 md:p-8 relative overflow-hidden group"
    >
      {/* Background Accent Text */}
      <div className="absolute -right-10 -top-10 text-[150px] md:text-[200px] font-display opacity-5 text-transit-white group-hover:text-transit-yellow transition-colors duration-700 pointer-events-none select-none leading-none">
        {title.substring(0, 3).toUpperCase()}
      </div>

      <div className="mb-8 border-b-4 border-transit-white pb-4 relative z-10">
        <h2 className="text-5xl md:text-6xl font-display uppercase tracking-wide text-transit-white leading-none">{title}</h2>
        <p className="font-mono text-transit-yellow text-sm md:text-base uppercase mt-3 tracking-widest">DEST // {subtitle}</p>
      </div>

      <div className="relative z-10">
        {isLoading ? (
          <div className="led-text animate-pulse text-2xl md:text-3xl py-8">LOADING_DATA...</div>
        ) : error ? (
          <div className="led-text-orange text-xl md:text-2xl py-8">ERR: {error}</div>
        ) : departures.length === 0 ? (
          <div className="led-text text-xl md:text-2xl opacity-50 py-8">NO_SERVICE_AVAILABLE</div>
        ) : (
          <div className="space-y-8">
            {/* Next Bus */}
            {nextBus && (
              <div className="relative">
                <div className="text-xs md:text-sm font-mono text-transit-white/50 mb-2 tracking-widest flex items-center">
                  NEXT_DEPARTURE
                  {nextBus.date > new Date().toISOString().split('T')[0] && (
                    <span className="ml-3 bg-transit-yellow text-transit-black px-2 py-0.5 text-[10px] font-bold tracking-widest animate-pulse">TOMORROW</span>
                  )}
                </div>
                <div className="flex justify-between items-end gap-4">
                  <div className="text-6xl md:text-8xl font-display leading-none text-transit-yellow tracking-tighter">
                    {formatTime12h(nextBus.best_departure_estimate)}
                  </div>
                  <div className="text-right pb-1 md:pb-2">
                    <div className="font-mono text-transit-black font-bold text-xl md:text-3xl bg-transit-yellow px-3 py-1 inline-block">
                      {nextBus.line}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Last Bus */}
            {lastBus && (
              <div className="relative border-t-2 border-dashed border-transit-white/20 pt-8">
                <div className="text-xs md:text-sm font-mono text-transit-orange mb-2 flex items-center gap-2 tracking-widest">
                  <span className="w-2 h-2 bg-transit-orange rounded-full animate-pulse"></span>
                  FINAL_SERVICE
                  {lastBus.date > new Date().toISOString().split('T')[0] && (
                    <span className="ml-3 bg-transit-orange text-transit-black px-2 py-0.5 text-[10px] font-bold tracking-widest">TOMORROW</span>
                  )}
                </div>
                <div className="flex justify-between items-end gap-4">
                  <div className="text-5xl md:text-7xl font-display leading-none text-transit-orange tracking-tighter">
                    {formatTime12h(lastBus.best_departure_estimate)}
                  </div>
                  <div className="text-right pb-1 md:pb-2">
                    <div className="font-mono text-transit-black font-bold text-lg md:text-2xl bg-transit-orange px-3 py-1 inline-block">
                      {lastBus.line}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
