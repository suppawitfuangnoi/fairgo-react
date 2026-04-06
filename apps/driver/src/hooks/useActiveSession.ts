/**
 * useActiveSession — Driver App
 *
 * Runs on mount (and on reconnect) to restore the driver's session after a
 * page refresh or network drop.
 *
 * Logic:
 * 1. Fetch /trips/active → if found:
 *    a. Register active trip on socketClient (joins trip room)
 *    b. Mark driver as in-trip so heartbeat carries isInTrip=true
 *    c. Navigate to /trip-active/:tripId
 * 2. If no active trip, restore online presence if driver was online
 *    (stored in localStorage as 'fg_driver_online')
 *
 * Usage: Call once in the root authenticated layout of the driver app.
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { socketClient } from '@/lib/socket';

const ACTIVE_TRIP_PAGES = ['/trip-active', '/trip-summary', '/active-trip'];

const ONLINE_STORAGE_KEY = 'fg_driver_online';
const VEHICLE_STORAGE_KEY = 'fg_driver_vehicle_type';

/** Persist/read online intent across refreshes */
export const driverPresistence = {
  setOnline(vehicleType?: string) {
    localStorage.setItem(ONLINE_STORAGE_KEY, 'true');
    if (vehicleType) localStorage.setItem(VEHICLE_STORAGE_KEY, vehicleType);
    else localStorage.removeItem(VEHICLE_STORAGE_KEY);
  },
  setOffline() {
    localStorage.removeItem(ONLINE_STORAGE_KEY);
    localStorage.removeItem(VEHICLE_STORAGE_KEY);
  },
  wasOnline(): boolean {
    return localStorage.getItem(ONLINE_STORAGE_KEY) === 'true';
  },
  getVehicleType(): string | undefined {
    return localStorage.getItem(VEHICLE_STORAGE_KEY) ?? undefined;
  },
};

export function useActiveSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const checked  = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    const currentPath = location.pathname;
    if (ACTIVE_TRIP_PAGES.some((p) => currentPath.startsWith(p))) return;

    void restoreSession(navigate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check on socket reconnect
  useEffect(() => {
    const socket = socketClient.connect();

    const onReconnect = () => {
      // Fetch notifications to catch missed events
      apiFetch('/notifications?page=1&limit=20').catch(() => {});

      const currentPath = location.pathname;
      if (ACTIVE_TRIP_PAGES.some((p) => currentPath.startsWith(p))) return;
      void restoreSession(navigate);
    };

    socket.on('connect', onReconnect);
    return () => {
      socket.off('connect', onReconnect);
    };
  }, [navigate, location.pathname]);
}

async function restoreSession(navigate: ReturnType<typeof useNavigate>) {
  try {
    // 1. Check for active trip
    const trip = await apiFetch<{
      id: string;
      status: string;
    } | null>('/trips/active');

    if (trip?.id) {
      socketClient.setActiveTrip(trip.id);
      socketClient.setOnline(); // driver must be online if in trip
      console.log('[Driver useActiveSession] Restoring active trip:', trip.id);
      navigate(`/trip-active/${trip.id}`, { replace: true });
      return;
    }

    // 2. Restore online presence if driver intended to be online
    if (driverPresistence.wasOnline()) {
      const vehicleType = driverPresistence.getVehicleType();
      socketClient.setOnline(vehicleType);
      console.log('[Driver useActiveSession] Restored online presence');
    }
  } catch (err) {
    console.warn('[Driver useActiveSession] Restore check failed:', err);
  }
}
