import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlacesAutocomplete, type PlaceDetail } from '@/hooks/usePlacesAutocomplete';

interface PlaceSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: PlaceDetail) => void;
  placeholder?: string;
  dotColor?: string; // tailwind bg color class e.g. "bg-primary"
  autoFocus?: boolean;
  readOnly?: boolean;
}

export default function PlaceSearchInput({
  value,
  onChange,
  onSelect,
  placeholder = 'ค้นหาสถานที่',
  dotColor = 'bg-orange-500',
  autoFocus = false,
  readOnly = false,
}: PlaceSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const { query, setQuery, predictions, loading, getPlaceDetail } =
    usePlacesAutocomplete();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync external value → internal query when not focused
  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open, setQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    setQuery(v);
    setHighlightIdx(-1);
    setOpen(true);
  };

  const handleFocus = () => {
    if (value.length >= 2) setOpen(true);
  };

  const handleBlur = () => {
    // Small delay so mousedown on prediction item fires first
    setTimeout(() => {
      setOpen(false);
      setHighlightIdx(-1);
    }, 150);
  };

  const selectPrediction = useCallback(
    async (pred: (typeof predictions)[number]) => {
      setOpen(false);
      // Show main text immediately
      const displayName = pred.structured_formatting.main_text;
      onChange(displayName);
      setQuery(displayName);
      try {
        const detail = await getPlaceDetail(pred.place_id);
        // Use full description as address for API
        onSelect({ ...detail, address: pred.description, name: displayName });
        onChange(displayName);
      } catch {
        // Fallback — no coords
        onSelect({
          lat: 0,
          lng: 0,
          address: pred.description,
          name: displayName,
        });
      }
    },
    [predictions, onChange, setQuery, getPlaceDetail, onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !predictions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      selectPrediction(predictions[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative flex-1">
      {/* Input Row */}
      <div className="flex items-center gap-3">
        {/* Dot indicator */}
        <div className="flex-shrink-0 relative z-10">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor} shadow-sm`} />
        </div>

        <div className="flex-1 relative">
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            readOnly={readOnly}
            type="text"
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent border-none p-0 text-sm font-semibold text-slate-800 dark:text-white placeholder:text-slate-400 placeholder:font-normal focus:ring-0 outline-none"
          />
          {loading && (
            <span className="absolute right-0 top-1/2 -translate-y-1/2">
              <svg
                className="w-3.5 h-3.5 text-primary animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {open && predictions.length > 0 && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-2 z-[9999] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden"
        >
          {predictions.map((pred, idx) => (
            <button
              key={pred.place_id}
              onMouseDown={(e) => {
                e.preventDefault();
                selectPrediction(pred);
              }}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-b border-slate-50 dark:border-slate-700/50 last:border-none ${
                idx === highlightIdx
                  ? 'bg-primary/10 dark:bg-primary/20'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/60'
              }`}
            >
              <span className="material-icons-round text-slate-400 text-[18px] mt-0.5 flex-shrink-0">
                location_on
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                  {pred.structured_formatting.main_text}
                </p>
                {pred.structured_formatting.secondary_text && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {pred.structured_formatting.secondary_text}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
