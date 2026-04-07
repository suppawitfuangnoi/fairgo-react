/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';

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

interface RouteConfig {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}

interface GoogleMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: Marker[];
  className?: string;
  onMapReady?: (map: any) => void;
  showTraffic?: boolean;
  route?: RouteConfig;
}

const COLOR_HEX: Record<string, string> = {
  blue: '#13c8ec',
  red: '#ef4444',
  green: '#22c55e',
  orange: '#f97316',
};

export default function GoogleMap({
  center = { lat: 13.7563, lng: 100.5018 },
  zoom = 15,
  markers = [],
  className = '',
  onMapReady,
  showTraffic = false,
  route,
}: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  // Poll until google.maps is available
  useEffect(() => {
    let attempts = 0;
    const tryInit = () => {
      if (window.google?.maps) { setReady(true); return; }
      if (++attempts < 50) setTimeout(tryInit, 200);
    };
    tryInit();
  }, []);

  // Initialize map — no mapId (requires a real Cloud Console ID; arbitrary strings cause silent failures)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom,
      mapId: 'a9d68526588d406f3c630bbb',
      disableDefaultUI: true,
      gestureHandling: 'cooperative',
    });
    if (showTraffic) {
      new window.google.maps.TrafficLayer().setMap(map);
    }
    mapInstanceRef.current = map;
    if (onMapReady) onMapReady(map);
  }, [ready]);

  // Sync center when no route is active
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setCenter(center);
  }, [center.lat, center.lng]);

  // Draw markers — prefer AdvancedMarkerElement, fall back to legacy Marker
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    // Clear existing
    markersRef.current.forEach((m) => {
      if (m.setMap) m.setMap(null);   // legacy Marker
      else m.map = null;               // AdvancedMarkerElement
    });
    markersRef.current = [];

    const AdvancedMarkerElement = window.google?.maps?.marker?.AdvancedMarkerElement;

    markers.forEach((marker) => {
      const color = COLOR_HEX[marker.color || 'blue'];

      if (AdvancedMarkerElement) {
        // Modern path
        const dot = document.createElement('div');
        dot.style.cssText = `
          width:${marker.pulse ? 20 : 16}px;
          height:${marker.pulse ? 20 : 16}px;
          background:${color};
          border-radius:50%;
          border:3px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,.3);
        `;
        const m = new AdvancedMarkerElement({
          position: { lat: marker.lat, lng: marker.lng },
          map: mapInstanceRef.current,
          title: marker.label,
          content: dot,
        });
        markersRef.current.push(m);
      } else {
        // Legacy fallback (still supported, just deprecated)
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

  // Draw route via Directions API
  useEffect(() => {
    if (!mapInstanceRef.current || !ready) return;
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }
    if (!route) return;
    const directionsService = new window.google.maps.DirectionsService();
    const directionsRenderer = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#13c8ec', strokeWeight: 4, strokeOpacity: 0.8 },
    });
    directionsRenderer.setMap(mapInstanceRef.current);
    directionsRendererRef.current = directionsRenderer;
    directionsService.route(
      {
        origin: route.origin,
        destination: route.destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result: any, status: string) => {
        if (status === 'OK') directionsRenderer.setDirections(result);
      }
    );
  }, [ready, route?.origin?.lat, route?.origin?.lng, route?.destination?.lat, route?.destination?.lng]);

  if (!ready) {
    return (
      <div className={`bg-gray-200 animate-pulse flex items-center justify-center ${className}`}>
        <span className="text-gray-400 text-sm">กำลังโหลดแผนที่...</span>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
}
