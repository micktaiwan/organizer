import { useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '../stores/store.js';
import { apiClient } from '../api/client.js';
import {
  TypingEvent,
  UnreadEvent,
  UserOnlineEvent,
  UserOfflineEvent,
  UsersInitEvent,
} from '../types.js';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const connectingRef = useRef(false);

  const token = useStore((s) => s.token);
  const server = useStore((s) => s.server);
  const setConnected = useStore((s) => s.setConnected);
  const setConnecting = useStore((s) => s.setConnecting);
  const setOnlineUsers = useStore((s) => s.setOnlineUsers);
  const setUserOnline = useStore((s) => s.setUserOnline);
  const setUserOffline = useStore((s) => s.setUserOffline);
  const addTypingUser = useStore((s) => s.addTypingUser);
  const removeTypingUser = useStore((s) => s.removeTypingUser);
  const updateUnreadCount = useStore((s) => s.updateUnreadCount);
  const addMessage = useStore((s) => s.addMessage);

  const connect = useCallback((onConnected?: () => void) => {
    // Prevent duplicate connections
    if (!token || socketRef.current || connectingRef.current) return;

    connectingRef.current = true;
    setConnecting(true);

    const socket = io(server, {
      auth: { token, clientType: 'cli' },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setConnected(true);
      setConnecting(false);
      connectingRef.current = false;
      onConnected?.();
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', () => {
      setConnecting(false);
      setConnected(false);
      connectingRef.current = false;
    });

    // Users events
    socket.on('users:init', (data: UsersInitEvent) => {
      setOnlineUsers(data.users);
    });

    socket.on('user:online', (data: UserOnlineEvent) => {
      setUserOnline({
        id: data.userId,
        username: '',
        displayName: '',
        status: data.status,
        statusMessage: data.statusMessage,
        isMuted: data.isMuted,
        isOnline: true,
        isBot: data.isBot,
      });
    });

    socket.on('user:offline', (data: UserOfflineEvent) => {
      setUserOffline(data.userId);
    });

    // Typing events
    socket.on('typing:start', (data: TypingEvent) => {
      addTypingUser(data.roomId, data.from);
    });

    socket.on('typing:stop', (data: TypingEvent) => {
      removeTypingUser(data.roomId, data.from);
    });

    // Message events
    socket.on('message:new', async (data: { messageId: string; roomId: string }) => {
      try {
        const { message } = await apiClient.getMessage(data.messageId);
        addMessage(data.roomId, message);
      } catch {
        // Failed to fetch message (could be aborted on exit)
      }
    });

    // Unread events
    socket.on('unread:updated', (data: UnreadEvent) => {
      updateUnreadCount(data.roomId, data.unreadCount);
    });

    socketRef.current = socket;
  }, [
    token,
    server,
    setConnected,
    setConnecting,
    setOnlineUsers,
    setUserOnline,
    setUserOffline,
    addTypingUser,
    removeTypingUser,
    updateUnreadCount,
    addMessage,
  ]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      connectingRef.current = false;
      setConnected(false);
    }
  }, [setConnected]);

  const joinRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('room:join', { roomId });
  }, []);

  const leaveRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('room:leave', { roomId });
  }, []);

  const startTyping = useCallback((roomId: string) => {
    socketRef.current?.emit('typing:start', { roomId });
  }, []);

  const stopTyping = useCallback((roomId: string) => {
    socketRef.current?.emit('typing:stop', { roomId });
  }, []);

  return {
    socket: socketRef.current,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    startTyping,
    stopTyping,
  };
}
