import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    google: any;
  }
}

interface Marker {
  lat: number;
  lng: number;
  label?: string;
  color?: 'blue' | 'red' | 'green' | 'orange';
  pulse?: boolean;
}

interface GoogleMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: Marker[];
  className?: string;
  onMapReady?: (map: any) => void;
  showTraffic?: boolean;
  /** When set, draws a Directions route between origin and destination */
  route?: { origin: { lat: number; lng: number }; destination: { lat: number; lng: number } };
  /** Called with drive duration in minutes when a route is successfully fetched */
  onDurationChange?: (minutes: number) => void;
  /** Called when user clicks on the map (not on a marker) */
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  /** Called continuously as the map center changes (for map-picker mode) */
  onCenterChange?: (coords: { lat: number; lng: number }) => void;
  /** Override gesture handling; defaults to 'cooperative'. Use 'greedy' for picker mode. */
  gestureHandling?: 'cooperative' | 'greedy' | 'none' | 'auto';
}

const COLOR_HEX: Record<string, string> = {
  blue: '#13c8ec',
  red: '#ef4444',
  green: '#22c55e',
  orange: '#f97316',
};

function makeMarkerElement(color: string, pulse: boolean): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;';

  const dot = document.createElement('div');
  dot.style.cssText = `
    width:${pulse ? 20 : 16}px;
    height:${pulse ? 20 : 16}px;
    background:${color};
    border-radius:50%;
    border:3px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,0.3);
    position:relative;
    z-index:1;
  `;
  wrapper.appendChild(dot);

  if (pulse) {
    const ring = document.createElement('div');
    ring.style.cssText = `
      position:absolute;
      width:32px;height:32px;
      border-radius:50%;
      border:2px solid ${color};
      opacity:0.5;
      animation:pulse-ring 1.5s ease-out infinite;
    `;
    wrapper.appendChild(ring);

    if (!document.getElementById('adv-marker-style')) {
      const style = document.createElement('style');
      style.id = 'adv-marker-style';
      style.textContent = `
        @keyframes pulse-ring {
          0%   { transform:scale(0.8); opacity:0.6; }
          100% { transform:scale(1.8); opacity:0; }
        }
      `;
      document.head.appendChild(style);
    }
  }
  return wrapper;
}

export default function GoogleMap({
  center = { lat: 13.7563, lng: 100.5018 },
  zoom = 15,
  markers = [],
  className = '',
  onMapReady,
  showTraffic = false,
  route,
  onDurationChange,
  onMapClick,
  onCenterChange,
  gestureHandling = 'cooperative',
}: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);
  const onMapClickRef = useRef(onMapClick);
  const onCenterChangeRef = useRef(onCenterChange);
  const [ready, setReady] = useState(false);

  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onCenterChangeRef.current = onCenterChange; }, [onCenterChange]);

  useEffect(() => {
    let attempts = 0;
    const tryInit = () => {
      if (window.google?.maps) { setReady(true); return; }
      if (++attempts < 50) setTimeout(tryInit, 200);
    };
    tryInit();
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom,
      mapId: 'a9d68526588d406f39c9cc17',
      disableDefaultUI: true,
      gestureHandling,
    });

    if (showTraffic) {
      new window.google.maps.TrafficLayer().setMap(map);
    }

    const renderer = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#13c8ec',
        strokeOpacity: 0.85,
        strokeWeight: 5,
      },
    });
    renderer.setMap(map);
    directionsRendererRef.current = renderer;

    map.addListener('click', (e: any) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    });

    map.addListener('idle', () => {
      if (onCenterChangeRef.current) {
        const c = map.getCenter();
        onCenterChangeRef.current({ lat: c.lat(), lng: c.lng() });
      }
    });

    mapInstanceRef.current = map;
    if (onMapReady) onMapReady(map);
  }, [ready]);

  const hasRoute = !!route;
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (hasRoute) return;
    mapInstanceRef.current.setCenter(center);
  }, [center.lat, center.lng, hasRoute]);

  useEffect(() => {
    if (!mapInstanceRef.current || !directionsRendererRef.current) return;

    if (!route) {
      directionsRendererRef.current.setDirections({ routes: [] });
      return;
    }

    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin: route.origin,
        destination: route.destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
        region: 'TH',
      },
      (result: any, status: string) => {
        if (status === 'OK') {
          directionsRendererRef.current.setDirections(result);
          mapInstanceRef.current.fitBounds(result.routes[0].bounds, 60);
          const leg = result.routes[0]?.legs?.[0];
          if (leg?.duration?.value && onDurationChange) {
            onDurationChange(Math.ceil(leg.duration.value / 60));
          }
        }
      }
    );
  }, [route?.origin.lat, route?.origin.lng, route?.destination.lat, route?.destination.lng]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    markersRef.current.forEach((m) => {
      if (m.setMap) m.setMap(null);
      else m.map = null;
    });
    markersRef.current = [];

    const AdvancedMarkerElement = window.google?.maps?.marker?.AdvancedMarkerElement;

    markers.forEach((marker) => {
      const color = COLOR_HEX[marker.color || 'blue'];
      if (AdvancedMarkerElement) {
        const el = makeMarkerElement(color, !!marker.pulse);
        const m = new AdvancedMarkerElement({
          position: { lat: marker.lat, lng: marker.lng },
          map: mapInstanceRef.current,
          title: marker.label,
          content: el,
        });
        markersRef.current.push(m);
      } else {
        // Legacy fallback
        const m = new window.google.maps.Marker({
          position: { lat: marker.lat, lng: marker.lng },
          map: mapInstanceRef.current,
          title: marker.label,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
            scale: marker.pulse ? 10 : 8,
          },
          zIndex: 10,
        });
        markersRef.current.push(m);
      }
    });
  }, [markers]);

  if (!ready) {
    return (
      <div className={`bg-gray-200 animate-pulse flex items-center justify-center ${className}`}>
        <span className="text-gray-400 text-sm">กำลังโหลดแผนที่...</span>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
}
