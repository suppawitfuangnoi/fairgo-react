import React, { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    google: typeof google;
    initGoogleMap?: () => void;
  }
}

const GOOGLE_MAPS_KEY = import.meta?.env?.VITE_GOOGLE_MAPS_KEY || '';

let scriptLoaded = false;
let scriptLoading = false;
const callbacks: (() => void)[] = [];

function loadGoogleMaps(callback: () => void) {
  if (scriptLoaded && window.google) { callback(); return; }
  callbacks.push(callback);
  if (scriptLoading) return;
  scriptLoading = true;
  window.initGoogleMap = () => {
    scriptLoaded = true;
    scriptLoading = false;
    callbacks.forEach((cb) => cb());
    callbacks.length = 0;
  };
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places,geometry&callback=initGoogleMap&language=th`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export interface LatLng { lat: number; lng: number; }

export interface MapMarker {
  id: string;
  position: LatLng;
  icon?: string | google.maps.Icon | google.maps.Symbol;
  title?: string;
  label?: string;
}

export interface GoogleMapProps {
  center?: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  polyline?: LatLng[];
  className?: string;
  height?: string;
  onMapReady?: (map: google.maps.Map) => void;
  onClick?: (latlng: LatLng) => void;
  fitBounds?: boolean;
}

export function GoogleMap({
  center = { lat: 13.7563, lng: 100.5018 }, // Bangkok default
  zoom = 14,
  markers = [],
  polyline = [],
  className = '',
  height = '100%',
  onMapReady,
  onClick,
  fitBounds = false,
}: GoogleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  const initMap = useCallback(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new window.google.maps.Map(containerRef.current, {
      center,
      zoom,
      disableDefaultUI: true,
      zoomControl: true,
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
    });

    mapRef.current = map;
    onMapReady?.(map);

    if (onClick) {
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) onClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
    }
  }, [center.lat, center.lng, zoom]);

  // Load SDK once
  useEffect(() => {
    loadGoogleMaps(initMap);
  }, [initMap]);

  // Sync markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const ids = new Set(markers.map((m) => m.id));
    markersRef.current.forEach((marker, id) => {
      if (!ids.has(id)) { marker.setMap(null); markersRef.current.delete(id); }
    });
    markers.forEach((m) => {
      if (markersRef.current.has(m.id)) {
        markersRef.current.get(m.id)!.setPosition(m.position);
      } else {
        const gm = new window.google.maps.Marker({
          position: m.position,
          map,
          icon: m.icon,
          title: m.title,
          label: m.label,
          animation: window.google.maps.Animation.DROP,
        });
        markersRef.current.set(m.id, gm);
      }
    });

    if (fitBounds && markers.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend(m.position));
      map.fitBounds(bounds, 60);
    }
  }, [markers, fitBounds]);

  // Sync polyline
  useEffect(() => {
    if (!mapRef.current) return;
    polylineRef.current?.setMap(null);
    if (polyline.length > 1) {
      polylineRef.current = new window.google.maps.Polyline({
        path: polyline,
        geodesic: true,
        strokeColor: '#13c8ec',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map: mapRef.current,
      });
    }
  }, [polyline]);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" />
      {/* Loading skeleton */}
      {!scriptLoaded && (
        <div className="absolute inset-0 bg-bg-light animate-pulse flex items-center justify-center">
          <div className="text-center text-text-secondary">
            <span className="material-symbols-outlined text-4xl block mb-2">map</span>
            <p className="text-sm">กำลังโหลดแผนที่...</p>
          </div>
        </div>
      )}
    </div>
  );
}
