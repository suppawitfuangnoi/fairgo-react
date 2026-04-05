import { useState, useEffect, useRef } from 'react';

/** Convert lat/lng → human-readable Thai address using Google Geocoder */
export function useReverseGeocode(lat: number, lng: number) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  // Track last geocoded coords to avoid redundant calls
  const lastCoordsRef = useRef<string>('');

  useEffect(() => {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    // Skip if coords haven't changed meaningfully or are the default Bangkok center
    if (!lat || !lng || key === lastCoordsRef.current) return;
    // Skip default fallback coords (not real user position)
    if (lat === 13.7563 && lng === 100.5018) return;

    // Wait for google maps
    let attempts = 0;
    const tryGeocode = () => {
      if (!window.google?.maps) {
        if (++attempts < 50) setTimeout(tryGeocode, 200);
        return;
      }

      lastCoordsRef.current = key;
      setLoading(true);

      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode(
        { location: { lat, lng } },
        (results: any[], status: string) => {
          setLoading(false);
          if (status === 'OK' && results?.length) {
            // Prefer a result that has a street address
            const streetResult =
              results.find((r) =>
                r.types.some((t: string) =>
                  ['street_address', 'route', 'premise', 'establishment'].includes(t)
                )
              ) || results[0];

            // Build a short label: "ชื่อถนน, เขต" without "ประเทศไทย"
            const components: string[] = [];
            let streetNumber = '';
            let route = '';
            let sublocality = '';
            let district = '';

            for (const c of streetResult.address_components) {
              if (c.types.includes('street_number')) streetNumber = c.long_name;
              if (c.types.includes('route')) route = c.short_name || c.long_name;
              if (c.types.includes('sublocality_level_1') || c.types.includes('sublocality'))
                sublocality = c.long_name;
              if (c.types.includes('administrative_area_level_2'))
                district = c.long_name;
            }

            if (route) components.push(streetNumber ? `${streetNumber} ${route}` : route);
            if (sublocality) components.push(sublocality);
            else if (district) components.push(district);

            setAddress(
              components.length ? components.join(', ') : streetResult.formatted_address
            );
          }
        }
      );
    };

    tryGeocode();
  }, [lat, lng]);

  return { address, loading };
}
