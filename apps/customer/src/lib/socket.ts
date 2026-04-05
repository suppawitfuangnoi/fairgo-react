/**
 * Local Socket client for the customer app.
 * Mirrors the interface of @fairgo/api-client socketClient/socketEvents
 * without pulling in that package (which has a React dependency).
 */
import { io, Socket } from 'socket.io-client';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  'https://fairgo-react-production.up.railway.app';

let _socket: Socket | null = null;

export const socketClient = {
  connect(): Socket {
    if (!_socket || !_socket.connected) {
      const token = localStorage.getItem('fg_access_token');
      _socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    }
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
};

export const socketEvents = {
  ON_NEW_RIDE_REQUEST: 'ride:new_request',
  ON_OFFER_NEW: 'offer:new',
  ON_OFFER_ACCEPTED: 'offer:accepted',
  ON_OFFER_REJECTED: 'offer:rejected',
  ON_RIDE_CANCELLED: 'ride:cancelled',
  ON_TRIP_CREATED: 'trip:created',
  ON_TRIP_STATUS: 'trip:status_update',
  ON_DRIVER_LOCATION: 'driver:location',
  ON_CHAT_MESSAGE: 'chat:message',
};
