import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from './api';

type SocketEventHandler = (...args: unknown[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, Set<SocketEventHandler>> = new Map();

  connect(token: string) {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(getApiBaseUrl(), {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      // Emit internal reconnect event so listeners can re-subscribe
      this.emit('internal:connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    // Re-emit events to registered handlers
    const events = [
      'user:online',
      'user:offline',
      'user:status-changed',
      'user:joined-room',
      'user:left-room',
      'typing:start',
      'typing:stop',
      'message:new',
      'message:read',
      'message:deleted',
      'message:reacted',
      // WebRTC signaling events
      'webrtc:offer',
      'webrtc:answer',
      'webrtc:ice-candidate',
      'webrtc:close',
      // Call signaling events
      'call:request',
      'call:accept',
      'call:reject',
      'call:end',
      'call:toggle-camera',
      // Notes events
      'note:created',
      'note:updated',
      'note:deleted',
      'label:created',
      'label:updated',
      'label:deleted',
      // Room events
      'room:created',
      'room:updated',
      'room:deleted',
    ];

    events.forEach((event) => {
      this.socket?.on(event, (...args) => {
        this.emit(event, ...args);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Register event handler
  on(event: string, handler: SocketEventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  // Emit to registered handlers
  private emit(event: string, ...args: unknown[]) {
    this.eventHandlers.get(event)?.forEach((handler) => handler(...args));
  }

  // Send events to server
  startTyping(roomId: string) {
    this.socket?.emit('typing:start', { roomId });
  }

  stopTyping(roomId: string) {
    this.socket?.emit('typing:stop', { roomId });
  }

  notifyMessage(roomId: string, messageId: string) {
    this.socket?.emit('message:notify', { roomId, messageId });
  }

  notifyRead(roomId: string, messageIds: string[]) {
    this.socket?.emit('message:read', { roomId, messageIds });
  }

  notifyDelete(roomId: string, messageId: string) {
    this.socket?.emit('message:delete', { roomId, messageId });
  }

  notifyReaction(roomId: string, messageId: string, emoji: string, action: string) {
    this.socket?.emit('message:react', { roomId, messageId, emoji, action });
  }

  joinRoom(roomId: string) {
    this.socket?.emit('room:join', { roomId });
  }

  leaveRoom(roomId: string) {
    this.socket?.emit('room:leave', { roomId });
  }

  // Notes subscription
  subscribeToNotes() {
    this.socket?.emit('note:subscribe');
  }

  unsubscribeFromNotes() {
    this.socket?.emit('note:unsubscribe');
  }

  // WebRTC Signaling
  sendOffer(to: string, offer: RTCSessionDescriptionInit) {
    this.socket?.emit('webrtc:offer', { to, offer });
  }

  sendAnswer(to: string, answer: RTCSessionDescriptionInit) {
    this.socket?.emit('webrtc:answer', { to, answer });
  }

  sendIceCandidate(to: string, candidate: RTCIceCandidateInit) {
    this.socket?.emit('webrtc:ice-candidate', { to, candidate });
  }

  closeWebRTC(to: string) {
    this.socket?.emit('webrtc:close', { to });
  }

  // Call Signaling
  requestCall(to: string, withCamera: boolean) {
    this.socket?.emit('call:request', { to, withCamera });
  }

  acceptCall(to: string, withCamera: boolean) {
    this.socket?.emit('call:accept', { to, withCamera });
  }

  rejectCall(to: string) {
    this.socket?.emit('call:reject', { to });
  }

  endCall(to: string) {
    this.socket?.emit('call:end', { to });
  }

  toggleCamera(to: string, enabled: boolean) {
    this.socket?.emit('call:toggle-camera', { to, enabled });
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
