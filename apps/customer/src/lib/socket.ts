/**
 * Customer app Socket.IO client
 *
 * Resilience features:
 * - Unlimited reconnection attempts (mobile networks lose connectivity often)
 * - On reconnect: refreshes auth token, rejoins active trip room and ride room
 * - apiFetch-based token refresh on auth errors
 */
import { io, Socket } from 'socket.io-client';
import { apiFetch } from './api';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  'https://fairgo-react-production.up.railway.app';

let _socket: Socket | null = null;

// Reconnect-state that survives socket teardown
const state = {
  activeTripId: undefined as string | undefined,
  activeRideId: undefined as string | undefined,
};

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
    // If refresh fails the auth guard will redirect to login
  }
  return null;
}

export const socketClient = {
  connect(): Socket {
    if (_socket?.connected) return _socket;

    const token = localStorage.getItem('fg_access_token');
    _socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
    });

    _socket.on('connect', () => {
      console.log('[Customer Socket] Connected:', _socket?.id);

      // Rejoin active trip room after reconnect
      if (state.activeTripId) {
        _socket!.emit('trip:join', state.activeTripId);
        console.log('[Customer Socket] Rejoined trip room:', state.activeTripId);
      }

      // Rejoin active ride room after reconnect
      if (state.activeRideId) {
        _socket!.emit('join:room', `ride:${state.activeRideId}`);
        console.log('[Customer Socket] Rejoined ride room:', state.activeRideId);
      }
    });

    _socket.on('disconnect', (reason) => {
      console.log('[Customer Socket] Disconnected:', reason);
    });

    _socket.on('connect_error', async (e) => {
      console.warn('[Customer Socket] Error:', e.message);
      if (e.message === 'Invalid token' || e.message === 'Authentication required') {
        const newToken = await refreshToken();
        if (newToken && _socket) {
          _socket.auth = { token: newToken };
        }
      }
    });

    return _socket;
  },

  disconnect() {
    _socket?.disconnect();
    _socket = null;
  },

  emit(event: string, data?: unknown) {
    _socket?.emit(event, data);
  },

  joinRoom(room: string) {
    _socket?.emit('join:room', { room });
  },

  leaveRoom(room: string) {
    _socket?.emit('leave:room', { room });
  },

  // ── State setters called by the customer app ─────────────────────────

  /** Call when customer books a trip / receives driver assignment. */
  setActiveTrip(tripId: string | undefined) {
    state.activeTripId = tripId;
    if (tripId) {
      _socket?.emit('trip:join', tripId);
    }
  },

  /** Call when customer creates a ride request. */
  setActiveRide(rideId: string | undefined) {
    state.activeRideId = rideId;
    if (rideId) {
      _socket?.emit('join:room', { room: `ride:${rideId}` });
    }
  },

  getState: () => ({ ...state }),
};

export const socketEvents = {
  ON_NEW_RIDE_REQUEST: 'ride:new_request',
  ON_OFFER_NEW:        'offer:new',
  ON_OFFER_ACCEPTED:   'offer:accepted',
  ON_OFFER_REJECTED:   'offer:rejected',
  ON_RIDE_CANCELLED:   'ride:cancelled',
  ON_TRIP_CREATED:     'trip:created',
  ON_TRIP_STATUS:      'trip:status_update',
  ON_DRIVER_LOCATION:  'driver:location',
  ON_CHAT_MESSAGE:     'chat:message',
};
