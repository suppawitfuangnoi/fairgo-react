import { useEffect, useRef, useCallback } from 'react';
import { socketClient } from '../socket';

/**
 * Connect socket and subscribe to an event.
 * Returns an `emit` helper for sending events.
 * Automatically disconnects on unmount if `disconnectOnUnmount` is true.
 */
export function useSocket(
  events?: Record<string, (data: unknown) => void>,
  options?: { disconnectOnUnmount?: boolean; rooms?: string[] }
) {
  const handlersRef = useRef(events);
  handlersRef.current = events;

  const emit = useCallback((event: string, data?: unknown) => {
    socketClient.emit(event, data);
  }, []);

  useEffect(() => {
    const socket = socketClient.connect();

    // Join rooms
    options?.rooms?.forEach((room) => socketClient.joinRoom(room));

    // Register event listeners
    const unsubscribers: (() => void)[] = [];
    if (events) {
      for (const [event, handler] of Object.entries(events)) {
        // Wrap handler so we always use latest version from ref
        const wrappedHandler = (data: unknown) => handlersRef.current?.[event]?.(data);
        socket.on(event, wrappedHandler);
        unsubscribers.push(() => socket.off(event, wrappedHandler));
      }
    }

    return () => {
      // Leave rooms
      options?.rooms?.forEach((room) => socketClient.leaveRoom(room));
      // Remove listeners
      unsubscribers.forEach((unsub) => unsub());
      // Optionally disconnect
      if (options?.disconnectOnUnmount) {
        socketClient.disconnect();
      }
    };
  }, []); // intentionally empty - connection is persistent

  return { emit };
}

/**
 * Subscribe to a single socket event.
 * Returns cleanup automatically on unmount.
 */
export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
  enabled = true
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const socket = socketClient.connect();
    const cb = (data: T) => handlerRef.current(data);
    socket.on(event, cb);
    return () => { socket.off(event, cb); };
  }, [event, enabled]);
}
