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

interface GoogleMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: Marker[];
  className?: string;
  onMapReady?: (map: any) => void;
  showTraffic?: boolean;
}

export default function GoogleMap({
  center = { lat: 13.7563, lng: 100.5018 },
  zoom = 15,
  markers = [],
  className = '',
  onMapReady,
  showTraffic = false,
}: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const tryInit = () => {
      if (window.google?.maps) { setReady(true); return; }
      attempts++;
      if (attempts < 50) setTimeout(tryInit, 200);
    };
    tryInit();
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const mapStyles = [
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    ];
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom,
      disableDefaultUI: true,
      styles: mapStyles,
      gestureHandling: 'cooperative',
    });
    if (showTraffic) {
      const trafficLayer = new window.google.maps.TrafficLayer();
      trafficLayer.setMap(map);
    }
    mapInstanceRef.current = map;
    if (onMapReady) onMapReady(map);
  }, [ready]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setCenter(center);
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const colorMap: Record<string, string> = {
      blue: '#13c8ec',
      red: '#ef4444',
      green: '#22c55e',
      orange: '#f97316',
    };
    markers.forEach((marker) => {
      const color = colorMap[marker.color || 'blue'];
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
      });
      markersRef.current.push(m);
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
