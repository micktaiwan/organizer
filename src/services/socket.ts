import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from './api';

type SocketEventHandler = (...args: unknown[]) => void;

// Watchdog: les timers JS sont gelés pendant la veille système, le backoff de
// socket.io peut donc ne jamais se redéclencher au réveil. On re-vérifie l'état
// réel à intervalle fixe (l'interval repart immédiatement au réveil).
const WATCHDOG_INTERVAL_MS = 15000;

class SocketService {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, Set<SocketEventHandler>> = new Map();
  private token: string | null = null;
  private watchdogId: ReturnType<typeof setInterval> | null = null;
  private lifecycleBound = false;

  connect(token: string) {
    this.token = token;

    // Socket déjà créé : on réutilise l'instance (pas de doublon de handlers)
    if (this.socket) {
      this.socket.auth = { token, clientType: 'desktop' };
      if (this.socket.connected) {
        console.log('Socket already connected, skipping');
        return;
      }
      console.log('Socket exists but disconnected, reconnecting');
      this.socket.connect();
      return;
    }

    const baseUrl = getApiBaseUrl();
    console.log('Socket connecting to:', baseUrl);

    this.socket = io(baseUrl, {
      auth: { token, clientType: 'desktop' },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      // Jamais d'abandon définitif : une coupure de plus de ~40 s laissait
      // l'app muette jusqu'au redémarrage (10 tentatives puis silence).
      reconnectionAttempts: Infinity,
      // Force polling first to diagnose WebSocket issues
      transports: ['polling', 'websocket'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      // Emit internal reconnect event so listeners can re-subscribe
      this.emit('internal:connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.emit('internal:disconnected', reason);
      // 'io server disconnect' (déconnexion forcée par le serveur, ex. redéploiement)
      // ne déclenche PAS de reconnexion automatique : on la relance nous-mêmes.
      if (reason === 'io server disconnect') {
        this.forceReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      if (error.message.includes('Token invalide') || error.message.includes('Token expiré')) {
        this.emit('internal:auth-error', error.message);
      }
      this.emit('internal:error', error.message);
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.emit('internal:reconnecting', attempt);
    });

    this.socket.io.on('reconnect_failed', () => {
      console.error('Socket reconnection gave up');
      this.emit('internal:reconnect-failed');
      // Filet de sécurité : le watchdog reprendra la main.
      this.forceReconnect();
    });

    this.bindLifecycle();
    this.startWatchdog();

    // Re-emit events to registered handlers
    const events = [
      'users:init',
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
      'video:thumbnail-ready',
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
      'call:screen-share',
      'call:answered-elsewhere',
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
      // Unread count updates
      'unread:updated',
      // Eko status
      'eko:status',
      'reflection:update',
      'reflection:progress',
    ];

    events.forEach((event) => {
      this.socket?.on(event, (...args) => {
        this.emit(event, ...args);
      });
    });
  }

  disconnect() {
    this.stopWatchdog();
    // Sans ça, les listeners online/focus relanceraient une connexion avec
    // l'ancien token après un logout.
    this.token = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.io.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  updateAuth(token: string) {
    this.token = token;
    if (this.socket) {
      this.socket.auth = { token, clientType: 'desktop' };
    }
  }

  /**
   * Relance une tentative immédiate sans attendre le backoff en cours.
   * Idempotent : sans effet si le socket est déjà connecté ou en cours d'ouverture.
   */
  forceReconnect() {
    if (!this.token) return;
    if (!this.socket) {
      this.connect(this.token);
      return;
    }
    if (this.socket.connected) return;
    this.socket.connect();
  }

  /**
   * Reconnexion proactive sur les signaux OS/navigateur : retour du réseau,
   * fenêtre remise au premier plan, sortie de veille.
   */
  private bindLifecycle() {
    if (this.lifecycleBound) return;
    this.lifecycleBound = true;

    const wake = (source: string) => {
      if (this.socket?.connected) return;
      console.log(`Socket wake-up (${source}), forcing reconnect`);
      this.forceReconnect();
    };

    window.addEventListener('online', () => wake('online'));
    window.addEventListener('focus', () => wake('focus'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake('visible');
    });
  }

  private startWatchdog() {
    if (this.watchdogId !== null) return;
    this.watchdogId = setInterval(() => {
      if (this.socket && !this.socket.connected) {
        this.forceReconnect();
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog() {
    if (this.watchdogId !== null) {
      clearInterval(this.watchdogId);
      this.watchdogId = null;
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

  sendScreenShare(to: string, enabled: boolean, trackId?: string) {
    this.socket?.emit('call:screen-share', { to, enabled, trackId });
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
