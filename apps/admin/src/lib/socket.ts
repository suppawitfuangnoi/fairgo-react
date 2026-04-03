import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://fairgo-production.up.railway.app';

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
    
    socket.on('connect', () => {
      console.log('[Admin Socket] Connected:', socket?.id);
      // Join admin room to receive all notifications
      socket?.emit('join:room', 'admin');
    });
    
    socket.on('disconnect', () => console.log('[Admin Socket] Disconnected'));
    socket.on('connect_error', (e) => console.warn('[Admin Socket] Error:', e.message));
    
    return socket;
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
  },

  getSocket: () => socket,
};
