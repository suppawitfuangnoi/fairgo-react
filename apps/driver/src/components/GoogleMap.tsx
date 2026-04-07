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
}: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

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
      mapId: 'fairgo-driver',
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
    markersRef.current.forEach((m) => { m.map = null; });
    markersRef.current = [];

    const AdvancedMarkerElement = window.google?.maps?.marker?.AdvancedMarkerElement;
    if (!AdvancedMarkerElement) return;

    markers.forEach((marker) => {
      const color = COLOR_HEX[marker.color || 'blue'];
      const el = makeMarkerElement(color, !!marker.pulse);
      const m = new AdvancedMarkerElement({
        position: { lat: marker.lat, lng: marker.lng },
        map: mapInstanceRef.current,
        title: marker.label,
        content: el,
      });
      markersRef.current.push(m);
    });
  }, [markers]);

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
