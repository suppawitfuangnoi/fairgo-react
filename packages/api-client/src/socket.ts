import { io, Socket } from 'socket.io-client';
import { authStore } from './auth';

const SOCKET_URL = (typeof window !== 'undefined' && (window as any).__FAIRGO_SOCKET__)
  || import.meta?.env?.VITE_SOCKET_URL
  || 'https://fairgo-api.vercel.app';

let socket: Socket | null = null;

export const socketClient = {
  connect(): Socket {
    if (socket?.connected) return socket;
    socket = io(SOCKET_URL, {
      auth: { token: authStore.getAccess() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socket.on('connect', () => console.log('[Socket] Connected:', socket?.id));
    socket.on('disconnect', () => console.log('[Socket] Disconnected'));
    socket.on('connect_error', (e) => console.warn('[Socket] Error:', e.message));
    return socket;
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
  },

  on<T = unknown>(event: string, cb: (data: T) => void) {
    socket?.on(event, cb);
    return () => socket?.off(event, cb);
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
};

// Typed event helpers
export const socketEvents = {
  // Driver events
  ON_NEW_RIDE_REQUEST: 'ride:new_request',
  ON_OFFER_ACCEPTED: 'offer:accepted',
  ON_OFFER_REJECTED: 'offer:rejected',
  ON_TRIP_CREATED: 'trip:created',
  ON_TRIP_STATUS: 'trip:status',
  ON_DRIVER_LOCATION: 'trip:driver:location',
  // Customer events
  ON_OFFER_NEW: 'offer:new',
  ON_RIDE_CANCELLED: 'ride:cancelled',
  // Admin events
  ON_ADMIN_TRIP: 'admin:trip',
  ON_ADMIN_RIDE: 'ride:new_request',
};
