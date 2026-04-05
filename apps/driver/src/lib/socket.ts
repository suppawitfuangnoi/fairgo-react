import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  || 'https://fairgo-react-production.up.railway.app';

let socket: Socket | null = null;

export const socketClient = {
  connect(): Socket {
    if (socket?.connected) return socket;
    const token = localStorage.getItem('fg_access_token');
    socket = io(SOCKET_URL, {
      auth: { token },
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

export const socketEvents = {
  ON_NEW_RIDE_REQUEST: 'ride:new_request',
  ON_OFFER_ACCEPTED: 'offer:accepted',
  ON_OFFER_REJECTED: 'offer:rejected',
  ON_TRIP_CREATED: 'trip:created',
  ON_TRIP_STATUS: 'trip:status',
  ON_DRIVER_LOCATION: 'trip:driver:location',
  ON_OFFER_NEW: 'offer:new',
  ON_RIDE_CANCELLED: 'ride:cancelled',
};
