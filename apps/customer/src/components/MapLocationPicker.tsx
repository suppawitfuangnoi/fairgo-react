import { useState, useEffect, useCallback, useRef } from 'react';
import GoogleMap from './GoogleMap';

interface Coords { lat: number; lng: number; }

interface MapLocationPickerProps {
  title: string;
  initialCenter: Coords;
  onConfirm: (coords: Coords, address: string) => void;
  onCancel: () => void;
}

/** Reverse geocode a coordinate using the Google Maps Geocoder */
function reverseGeocode(lat: number, lng: number): Promise<string> {
  return new Promise((resolve) => {
    const tryGeocode = (attempts = 0) => {
      if (!window.google?.maps) {
        if (attempts < 30) setTimeout(() => tryGeocode(attempts + 1), 200);
        else resolve('');
        return;
      }
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
        if (status !== 'OK' || !results?.length) { resolve(''); return; }
        const res = results.find((r: any) =>
          r.types.some((t: string) => ['street_address', 'route', 'premise', 'establishment'].includes(t))
        ) || results[0];
        const comps: string[] = [];
        let streetNumber = '', route = '', sublocality = '', district = '';
        for (const c of res.address_components) {
          if (c.types.includes('street_number')) streetNumber = c.long_name;
          if (c.types.includes('route')) route = c.short_name || c.long_name;
          if (c.types.includes('sublocality_level_1') || c.types.includes('sublocality')) sublocality = c.long_name;
          if (c.types.includes('administrative_area_level_2')) district = c.long_name;
        }
        if (route) comps.push(streetNumber ? `${streetNumber} ${route}` : route);
        if (sublocality) comps.push(sublocality);
        else if (district) comps.push(district);
        resolve(comps.length ? comps.join(', ') : res.formatted_address);
      });
    };
    tryGeocode();
  });
}

export default function MapLocationPicker({
  title,
  initialCenter,
  onConfirm,
  onCancel,
}: MapLocationPickerProps) {
  const [center, setCenter] = useState<Coords>(initialCenter);
  const [address, setAddress] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Reverse geocode whenever center changes (debounced)
  const handleCenterChange = useCallback((coords: Coords) => {
    setCenter(coords);
    setAddress('');
    setGeocoding(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const addr = await reverseGeocode(coords.lat, coords.lng);
      setAddress(addr);
      setGeocoding(false);
    }, 400);
  }, []);

  // Initial reverse geocode
  useEffect(() => {
    setGeocoding(true);
    reverseGeocode(initialCenter.lat, initialCenter.lng).then((addr) => {
      setAddress(addr);
      setGeocoding(false);
    });
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 z-10 shadow-sm">
        <button
          onClick={onCancel}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <span className="material-icons-round text-slate-700 dark:text-white">arrow_back</span>
        </button>
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white text-base">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">เลื่อนแผนที่เพื่อเลือกตำแหน่ง</p>
        </div>
      </div>

      {/* Map + fixed crosshair */}
      <div className="relative flex-1">
        <GoogleMap
          center={initialCenter}
          zoom={16}
          markers={[]}
          className="absolute inset-0 w-full h-full"
          onCenterChange={handleCenterChange}
          gestureHandling="greedy"
        />

        {/* Centered pin (CSS-fixed, map moves underneath) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="flex flex-col items-center" style={{ marginTop: -24 }}>
            <span
              className="material-icons-round drop-shadow-lg"
              style={{ fontSize: 48, color: '#13c8ec', lineHeight: 1 }}
            >
              location_on
            </span>
            {/* Shadow dot on "ground" */}
            <div className="w-2 h-1 bg-black/20 rounded-full -mt-1" />
          </div>
        </div>

        {/* Panning hint chip */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/90 dark:bg-slate-800/90 backdrop-blur px-4 py-2 rounded-full shadow text-xs font-semibold text-slate-700 dark:text-white flex items-center gap-1.5 pointer-events-none">
          <span className="material-icons-round text-primary text-sm">open_with</span>
          ลากแผนที่เพื่อย้ายพิน
        </div>
      </div>

      {/* Address + Confirm */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="flex items-start gap-3 mb-4">
          <span className="material-icons-round text-primary mt-0.5">location_on</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">ตำแหน่งที่เลือก</p>
            {geocoding ? (
              <div className="h-4 w-48 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
            ) : (
              <p className="text-sm font-semibold text-slate-800 dark:text-white leading-snug">
                {address || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => onConfirm(center, address)}
          disabled={geocoding}
          className="w-full bg-primary hover:bg-[#0fbddf] disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/25 active:translate-y-0.5 transition-all flex items-center justify-center gap-2"
        >
          <span className="material-icons-round text-sm">check_circle</span>
          ยืนยันตำแหน่งนี้
        </button>
      </div>
    </div>
  );
}
