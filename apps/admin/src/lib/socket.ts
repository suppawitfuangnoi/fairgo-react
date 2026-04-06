/**
 * Admin app Socket.IO client
 *
 * The server auto-joins ADMIN-role sockets to the `admin:monitor` room
 * on connection — no manual join:room emit needed.
 *
 * Resilience: unlimited reconnects with exponential back-off.
 */
import { io, Socket } from 'socket.io-client';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || 'https://fairgo-react-production.up.railway.app';

let socket: Socket | null = null;

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
      console.log('[Admin Socket] Connected:', socket?.id);
      // Server automatically places ADMIN sockets in admin:monitor room.
      // No manual join:room emit required here.
    });

    socket.on('disconnect', (reason) => {
      console.log('[Admin Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (e) => {
      console.warn('[Admin Socket] Error:', e.message);
    });

    return socket;
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
  },

  getSocket: () => socket,
};
