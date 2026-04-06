/**
 * useActiveSession — Driver App
 *
 * Runs on mount (and on socket reconnect) to restore the driver's session
 * after a page refresh or network drop. Checks in priority order:
 *
 * 1. Active TRIP (non-terminal status)  → /trip-active/:tripId
 * 2. Terminal TRIP status               → /trip-summary/:tripId  (no re-entry)
 * 3. Pending OFFER (mid-negotiation)    → /submit-offer/:rideId
 * 4. If was online before refresh       → re-emit driver:online to server
 *
 * Persists "was online" intent in localStorage so refresh doesn't silently
 * mark the driver offline.
 *
 * Terminal statuses (mirror of backend trip-state-machine.ts):
 *   COMPLETED, CANCELLED, CANCELLED_BY_PASSENGER, CANCELLED_BY_DRIVER,
 *   NO_SHOW_PASSENGER, NO_SHOW_DRIVER
 *
 * Usage: call once inside ProtectedRoute (App.tsx).
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { socketClient } from '@/lib/socket';

const ACTIVE_TRIP_PAGES        = ['/trip-active', '/trip-summary', '/active-trip'];
const ACTIVE_NEGOTIATION_PAGES = ['/submit-offer'];

const ONLINE_STORAGE_KEY  = 'fg_driver_online';
const VEHICLE_STORAGE_KEY = 'fg_driver_vehicle_type';

// Mirror of backend TERMINAL_STATUSES — keep in sync with trip-state-machine.ts
const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'CANCELLED',
  'CANCELLED_BY_PASSENGER',
  'CANCELLED_BY_DRIVER',
  'NO_SHOW_PASSENGER',
  'NO_SHOW_DRIVER',
]);

// ── Persistence helpers (exported so HomePage toggle can use them) ────────────
export const driverPersistence = {
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

  // ── Run once on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    const path = location.pathname;
    // Already on the right screen — skip
    if (ACTIVE_TRIP_PAGES.some(p => path.startsWith(p))) return;
    if (ACTIVE_NEGOTIATION_PAGES.some(p => path.startsWith(p))) return;

    void restoreSession(navigate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-check on every socket reconnect ─────────────────────────────
  useEffect(() => {
    const socket = socketClient.connect();

    const onConnect = () => {
      // Fetch notifications to catch any missed events
      apiFetch('/notifications?page=1&limit=20').catch(() => {});

      const path = location.pathname;
      if (ACTIVE_TRIP_PAGES.some(p => path.startsWith(p))) return;
      if (ACTIVE_NEGOTIATION_PAGES.some(p => path.startsWith(p))) return;

      void restoreSession(navigate);
    };

    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, [navigate, location.pathname]);
}

// ─────────────────────────────────────────────────────────────────────────────

async function restoreSession(navigate: ReturnType<typeof useNavigate>) {
  try {
    // 1. Check for active trip (highest priority)
    const trip = await apiFetch<{ id: string; status: string } | null>('/trips/active');

    if (trip?.id) {
      socketClient.setActiveTrip(trip.id);

      if (TERMINAL_STATUSES.has(trip.status)) {
        // Trip finished — send driver to summary, not back into active trip UI
        console.log('[Driver useActiveSession] Restoring terminal trip (summary):', trip.id, trip.status);
        navigate(`/trip-summary/${trip.id}`, { replace: true });
      } else {
        socketClient.setOnline(); // must be online if in active trip
        console.log('[Driver useActiveSession] Restoring active trip:', trip.id, trip.status);
        navigate(`/trip-active/${trip.id}`, { replace: true });
      }
      return;
    }

    // 2. Check for pending negotiation offer
    const pending = await apiFetch<{
      offer: { id: string; fareAmount: number; roundNumber: number; expiresAt?: string };
      rideRequest: { id: string };
      customerCounter: unknown | null;
    } | null>('/offers/driver-pending');

    if (pending?.rideRequest?.id) {
      console.log('[Driver useActiveSession] Restoring negotiation for ride:', pending.rideRequest.id);
      navigate(`/submit-offer/${pending.rideRequest.id}`, {
        replace: true,
        state: { restored: true, pendingOffer: pending.offer, customerCounter: pending.customerCounter },
      });
      return;
    }

    // 3. Restore online presence if driver intended to be online
    if (driverPersistence.wasOnline()) {
      const vehicleType = driverPersistence.getVehicleType();
      socketClient.setOnline(vehicleType);
      console.log('[Driver useActiveSession] Restored online presence');
    }
  } catch (err) {
    console.warn('[Driver useActiveSession] Restore check failed:', err);
  }
}
