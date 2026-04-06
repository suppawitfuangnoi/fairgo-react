/**
 * Driver app Socket.IO client
 *
 * Resilience features:
 * - Unlimited reconnection attempts with exponential back-off (cap 30 s)
 * - Heartbeat emitted every 20 s while connected
 * - On reconnect: refreshes auth token, re-emits driver:online (if was online),
 *   and rejoins active trip room
 * - Heartbeat carries isInTrip flag so server never auto-offlines mid-trip drivers
 */
import { io, Socket } from 'socket.io-client';
import { apiFetch } from './api';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  'https://fairgo-react-production.up.railway.app';

const HEARTBEAT_INTERVAL_MS = 20_000; // 20 s

let socket: Socket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// Mutable reconnect-state — survives socket teardown
const state = {
  wasOnline: false,          // whether driver had gone online before disconnect
  vehicleType: undefined as string | undefined,
  activeTripId: undefined as string | undefined,
};

function clearHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat(s: Socket) {
  clearHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (s.connected) {
      s.emit('driver:heartbeat', {
        tripId: state.activeTripId,
      });
    }
  }, HEARTBEAT_INTERVAL_MS);
}

async function refreshToken(): Promise<string | null> {
  try {
    const res = await apiFetch<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
    });
    if (res?.accessToken) {
      localStorage.setItem('fg_access_token', res.accessToken);
      return res.accessToken;
    }
  } catch {
    // If refresh fails the user will be redirected to login by the auth guard
  }
  return null;
}

export const socketClient = {
  connect(): Socket {
    if (socket?.connected) return socket;

    const token = localStorage.getItem('fg_access_token');
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
    });

    socket.on('connect', () => {
      console.log('[Driver Socket] Connected:', socket?.id);
      startHeartbeat(socket!);

      // Restore online presence after reconnect
      if (state.wasOnline) {
        socket!.emit('driver:online', {
          vehicleType: state.vehicleType,
          tripId: state.activeTripId,
        });
        console.log('[Driver Socket] Re-emitted driver:online after reconnect');
      }

      // Rejoin active trip room if mid-trip
      if (state.activeTripId) {
        socket!.emit('join:room', `trip:${state.activeTripId}`);
        console.log('[Driver Socket] Rejoined trip room:', state.activeTripId);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[Driver Socket] Disconnected:', reason);
      clearHeartbeat();
    });

    socket.on('connect_error', async (e) => {
      console.warn('[Driver Socket] Error:', e.message);
      // Attempt token refresh on auth errors
      if (e.message === 'Invalid token' || e.message === 'Authentication required') {
        const newToken = await refreshToken();
        if (newToken && socket) {
          socket.auth = { token: newToken };
        }
      }
    });

    return socket;
  },

  disconnect() {
    clearHeartbeat();
    socket?.disconnect();
    socket = null;
  },

  emit(event: string, data?: unknown) {
    socket?.emit(event, data);
  },

  joinRoom(room: string) {
    socket?.emit('join:room', room);
  },

  leaveRoom(room: string) {
    socket?.emit('leave:room', room);
  },

  getSocket: () => socket,

  // ── State setters called by the driver app ──────────────────────────

  /** Call when driver taps "Go Online". Records intent for reconnect restore. */
  setOnline(vehicleType?: string) {
    state.wasOnline = true;
    state.vehicleType = vehicleType;
    socket?.emit('driver:online', { vehicleType, tripId: state.activeTripId });
  },

  /** Call when driver taps "Go Offline". Clears reconnect restore. */
  setOffline() {
    state.wasOnline = false;
    state.vehicleType = undefined;
    socket?.emit('driver:offline');
  },

  /** Call when driver starts or joins an active trip. */
  setActiveTrip(tripId: string | undefined) {
    state.activeTripId = tripId;
    if (tripId) {
      socket?.emit('join:room', `trip:${tripId}`);
    }
  },

  /** Expose state for debugging / restoration hooks */
  getState: () => ({ ...state }),
};

export const socketEvents = {
  ON_NEW_RIDE_REQUEST: 'ride:new_request',
  ON_OFFER_ACCEPTED:   'offer:accepted',
  ON_OFFER_REJECTED:   'offer:rejected',
  ON_TRIP_CREATED:     'trip:created',
  ON_TRIP_STATUS:      'trip:status',
  ON_DRIVER_LOCATION:  'trip:driver:location',
  ON_OFFER_NEW:        'offer:new',
  ON_RIDE_CANCELLED:   'ride:cancelled',
};
