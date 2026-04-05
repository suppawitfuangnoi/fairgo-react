import { useState, useEffect, useRef, useCallback } from 'react';

export interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface PlaceDetail {
  lat: number;
  lng: number;
  address: string;
  name: string;
}

/** Poll until google.maps.places is available */
function waitForPlaces(): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      if (window.google?.maps?.places) { resolve(); return; }
      if (++attempts < 60) setTimeout(check, 200);
    };
    check();
  });
}

export function usePlacesAutocomplete() {
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const serviceRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const getService = useCallback(async () => {
    if (!serviceRef.current) {
      await waitForPlaces();
      serviceRef.current = new window.google.maps.places.AutocompleteService();
    }
    return serviceRef.current;
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) {
      setPredictions([]);
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const service = await getService();
      if (!service) return;

      setLoading(true);
      service.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: 'th' },
          language: 'th',
        },
        (results: Prediction[] | null, status: string) => {
          setLoading(false);
          if (status === 'OK' && results) {
            setPredictions(results.slice(0, 5));
          } else {
            setPredictions([]);
          }
        }
      );
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [query, getService]);

  const getPlaceDetail = useCallback(
    (placeId: string): Promise<PlaceDetail> => {
      return new Promise(async (resolve, reject) => {
        await waitForPlaces();
        const placesService = new window.google.maps.places.PlacesService(
          document.createElement('div')
        );
        placesService.getDetails(
          { placeId, fields: ['geometry', 'formatted_address', 'name'] },
          (place: any, status: string) => {
            if (status === 'OK' && place?.geometry?.location) {
              resolve({
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                address: place.formatted_address || place.name,
                name: place.name || place.formatted_address,
              });
            } else {
              reject(new Error('Place not found'));
            }
          }
        );
      });
    },
    []
  );

  return { query, setQuery, predictions, loading, getPlaceDetail };
}
