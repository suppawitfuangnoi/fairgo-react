import React, { useCallback, useRef, useState } from 'react';

interface FareSliderProps {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  currency?: string;
  className?: string;
}

export function FareSlider({
  min,
  max,
  step = 10,
  value,
  onChange,
  currency = '฿',
  className = '',
}: FareSliderProps) {
  const [low, high] = value;
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'low' | 'high' | null>(null);

  const toPercent = (v: number) => ((v - min) / (max - min)) * 100;

  const fromPercent = (pct: number) => {
    const raw = (pct / 100) * (max - min) + min;
    return Math.round(raw / step) * step;
  };

  const getEventX = (e: MouseEvent | TouchEvent) =>
    'touches' in e ? e.touches[0].clientX : e.clientX;

  const handleMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!dragging.current || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((getEventX(e) - rect.left) / rect.width) * 100));
      const val = Math.min(max, Math.max(min, fromPercent(pct)));

      if (dragging.current === 'low') {
        const newLow = Math.min(val, high - step);
        onChange([newLow, high]);
      } else {
        const newHigh = Math.max(val, low + step);
        onChange([low, newHigh]);
      }
    },
    [low, high, min, max, step, onChange]
  );

  const handleUp = useCallback(() => {
    dragging.current = null;
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleUp);
    window.removeEventListener('touchmove', handleMove);
    window.removeEventListener('touchend', handleUp);
  }, [handleMove]);

  const startDrag = (thumb: 'low' | 'high') => {
    dragging.current = thumb;
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleUp);
  };

  const lowPct = toPercent(low);
  const highPct = toPercent(high);

  return (
    <div className={`select-none ${className}`}>
      {/* Labels */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-center">
          <p className="text-xs font-semibold text-text-secondary mb-0.5">ราคาต่ำสุด</p>
          <div className="bg-primary/10 border border-primary/30 rounded-xl px-3 py-1.5">
            <span className="text-base font-extrabold text-primary">
              {currency}{low.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center gap-1 px-2">
          <div className="h-px flex-1 bg-border-light" />
          <span className="text-xs text-text-secondary font-medium px-1">ถึง</span>
          <div className="h-px flex-1 bg-border-light" />
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-text-secondary mb-0.5">ราคาสูงสุด</p>
          <div className="bg-primary/10 border border-primary/30 rounded-xl px-3 py-1.5">
            <span className="text-base font-extrabold text-primary">
              {currency}{high.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Track */}
      <div ref={trackRef} className="relative h-6 flex items-center cursor-pointer">
        {/* Base track */}
        <div className="absolute inset-x-0 h-2 bg-border-light rounded-full" />

        {/* Active range */}
        <div
          className="absolute h-2 bg-gradient-to-r from-primary to-primary-dark rounded-full"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />

        {/* Low thumb */}
        <div
          className="absolute -translate-x-1/2 w-6 h-6 bg-white border-2 border-primary rounded-full shadow-card-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform z-10"
          style={{ left: `${lowPct}%` }}
          onMouseDown={() => startDrag('low')}
          onTouchStart={() => startDrag('low')}
        />

        {/* High thumb */}
        <div
          className="absolute -translate-x-1/2 w-6 h-6 bg-white border-2 border-primary rounded-full shadow-card-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform z-10"
          style={{ left: `${highPct}%` }}
          onMouseDown={() => startDrag('high')}
          onTouchStart={() => startDrag('high')}
        />
      </div>

      {/* Min / Max labels */}
      <div className="flex justify-between mt-1">
        <span className="text-xs text-text-secondary">{currency}{min.toLocaleString()}</span>
        <span className="text-xs text-text-secondary">{currency}{max.toLocaleString()}</span>
      </div>
    </div>
  );
}
