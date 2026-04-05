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
  /** Called when user clicks on the map (not on a marker) */
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  /** Called continuously as the map center changes (for map-picker mode) */
  onCenterChange?: (coords: { lat: number; lng: number }) => void;
  /** Override gesture handling; defaults to 'cooperative'. Use 'greedy' for picker mode. */
  gestureHandling?: 'cooperative' | 'greedy' | 'none' | 'auto';
}

export default function GoogleMap({
  center = { lat: 13.7563, lng: 100.5018 },
  zoom = 15,
  markers = [],
  className = '',
  onMapReady,
  showTraffic = false,
  route,
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

  // Keep refs in sync with latest callbacks (avoids stale closure in map listener)
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onCenterChangeRef.current = onCenterChange; }, [onCenterChange]);

  // Poll for Google Maps API availability
  useEffect(() => {
    let attempts = 0;
    const tryInit = () => {
      if (window.google?.maps) { setReady(true); return; }
      if (++attempts < 50) setTimeout(tryInit, 200);
    };
    tryInit();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    const mapStyles = [
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
      { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ];

    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom,
      disableDefaultUI: true,
      styles: mapStyles,
      gestureHandling,
    });

    if (showTraffic) {
      new window.google.maps.TrafficLayer().setMap(map);
    }

    // Set up DirectionsRenderer (hidden default markers — we use our own)
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

    // Map click listener
    map.addListener('click', (e: any) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    });

    // Center change listener (idle = after pan/zoom ends, smoother than center_changed)
    map.addListener('idle', () => {
      if (onCenterChangeRef.current) {
        const c = map.getCenter();
        onCenterChangeRef.current({ lat: c.lat(), lng: c.lng() });
      }
    });

    mapInstanceRef.current = map;
    if (onMapReady) onMapReady(map);
  }, [ready]);

  // Update center — skip when a route is active (fitBounds already controls the view)
  const hasRoute = !!route;
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (hasRoute) return; // DirectionsRenderer.fitBounds handles positioning
    mapInstanceRef.current.setCenter(center);
  }, [center.lat, center.lng, hasRoute]);

  // Draw / clear route
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
          // Auto-fit bounds to the route
          mapInstanceRef.current.fitBounds(result.routes[0].bounds, 60);
        }
      }
    );
  }, [route?.origin.lat, route?.origin.lng, route?.destination.lat, route?.destination.lng]);

  // Update markers
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
        zIndex: 10,
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
