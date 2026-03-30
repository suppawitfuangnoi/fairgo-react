import { Server as SocketIOServer } from "socket.io";

export function getIO(): SocketIOServer | null {
  return (global as Record<string, unknown>).__socketIO as SocketIOServer | null;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  const io = getIO();
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

export function emitToRoom(room: string, event: string, data: unknown) {
  const io = getIO();
  if (!io) return;
  io.to(room).emit(event, data);
}
