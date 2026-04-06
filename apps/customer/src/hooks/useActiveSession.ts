/**
 * useActiveSession — Customer App
 *
 * Runs on mount (and on every reconnect) to restore the customer's session
 * after a page refresh or network drop.
 *
 * Logic:
 * 1. Fetch /trips/active  → if found, navigate to /trip-active/:tripId
 * 2. If no active trip, fetch /rides/active → if found, navigate to /matching?rideId=...
 * 3. Register the relevant room on socketClient so reconnects rejoin correctly
 *
 * Usage: Call this hook once in the root authenticated layout (e.g. App.tsx or
 * a <ProtectedRoute> wrapper). It is intentionally idempotent — safe to run
 * multiple times.
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { socketClient } from '@/lib/socket';

// Pages that should NOT trigger auto-redirect (user is already on the right screen)
const ACTIVE_TRIP_PAGES  = ['/trip-active', '/trip-summary'];
const ACTIVE_RIDE_PAGES  = ['/matching', '/negotiation'];

export function useActiveSession() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const checked   = useRef(false);

  useEffect(() => {
    // Only check once per mount to avoid redirect loops
    if (checked.current) return;
    checked.current = true;

    const currentPath = location.pathname;

    // Skip if already on a relevant screen
    if (ACTIVE_TRIP_PAGES.some((p) => currentPath.startsWith(p))) return;
    if (ACTIVE_RIDE_PAGES.some((p) => currentPath.startsWith(p))) return;

    void restoreSession(navigate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check on socket reconnect so missed status updates are recovered
  useEffect(() => {
    const socket = socketClient.connect();

    const onReconnect = () => {
      // Fetch notifications to catch any missed events
      apiFetch('/notifications?page=1&limit=20').catch(() => {});

      const currentPath = location.pathname;
      if (ACTIVE_TRIP_PAGES.some((p) => currentPath.startsWith(p))) return;
      if (ACTIVE_RIDE_PAGES.some((p) => currentPath.startsWith(p))) return;

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
    // 1. Check for active trip first (higher priority)
    const tripRes = await apiFetch<{
      id: string;
      status: string;
    } | null>('/trips/active');

    if (tripRes?.id) {
      socketClient.setActiveTrip(tripRes.id);
      console.log('[useActiveSession] Restoring active trip:', tripRes.id);
      navigate(`/trip-active/${tripRes.id}`, { replace: true });
      return;
    }

    // 2. Check for active ride request (negotiation in progress)
    const rideRes = await apiFetch<{
      id: string;
      status: string;
    } | null>('/rides/active');

    if (rideRes?.id) {
      socketClient.setActiveRide(rideRes.id);
      console.log('[useActiveSession] Restoring active ride:', rideRes.id);
      navigate(`/matching?rideId=${rideRes.id}`, { replace: true });
    }
  } catch (err) {
    // Silently ignore — if the API is down the user stays on current page
    console.warn('[useActiveSession] Restore check failed:', err);
  }
}
