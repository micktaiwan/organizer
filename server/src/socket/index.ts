import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User, Room, Message } from '../models/index.js';
import { JwtPayload } from '../middleware/auth.js';
import { canCommunicate } from '../services/authorization.service.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  appVersionName?: string;
  appVersionCode?: string;
  clientType?: 'desktop' | 'android';
}

// Track typing timeouts: `${userId}:${roomId}` -> timeout handle
// Module-level singleton state (intentional - shared across all connections)
const typingTimeouts = new Map<string, NodeJS.Timeout>();
const TYPING_TIMEOUT_MS = 3000;

export function setupSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  // Middleware d'authentification Socket.io
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Token manquant'));
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return next(new Error('Configuration serveur invalide'));
      }

      const decoded = jwt.verify(token, secret) as JwtPayload;
      socket.userId = decoded.userId;
      socket.username = decoded.username;

      // Extraire la version de l'app (optionnel, envoyé par Android)
      socket.appVersionName = socket.handshake.auth.appVersionName;
      socket.appVersionCode = socket.handshake.auth.appVersionCode;

      // Detect client type: desktop sends clientType, Android sends appVersionCode
      if (socket.handshake.auth.clientType === 'desktop') {
        socket.clientType = 'desktop';
      } else if (socket.appVersionCode) {
        socket.clientType = 'android';
      }

      next();
    } catch (error) {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${socket.username} (${userId})`);

    // Préparer les données de mise à jour
    const updateData: Record<string, unknown> = {
      isOnline: true,
      lastSeen: new Date(),
    };

    // Ajouter la version de l'app si fournie (Android)
    if (socket.appVersionName && socket.appVersionCode) {
      updateData.appVersion = {
        versionName: socket.appVersionName,
        versionCode: parseInt(socket.appVersionCode, 10),
        updatedAt: new Date(),
      };
      console.log(`User ${socket.username} app version: ${socket.appVersionName} (${socket.appVersionCode})`);
    }

    // Update lastClient if detected
    if (socket.clientType) {
      updateData.lastClient = socket.clientType;
      console.log(`User ${socket.username} client type: ${socket.clientType}`);
    }

    // Mettre à jour le statut online et récupérer le user avec ses infos de statut
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    // Rejoindre une room personnelle pour WebRTC signaling direct
    socket.join(`user:${userId}`);

    // Rejoindre toutes les rooms de l'utilisateur
    const userRooms = await Room.find({ 'members.userId': userId });
    for (const room of userRooms) {
      socket.join(`room:${room._id}`);
    }

    // [USER_DATA_SYNC] Prepare status data for user:online
    // These fields must stay synchronized with users:init and /rooms API populate
    // See docs/specs.md section "Architecture: Sources de données utilisateur"
    const userStatusData = {
      userId,
      status: user?.status,
      statusMessage: user?.statusMessage,
      statusExpiresAt: user?.statusExpiresAt,
      isMuted: user?.isMuted,
      isBot: user?.isBot,
      appVersion: user?.appVersion,
      lastClient: user?.lastClient,
    };

    // Notifier les autres utilisateurs du statut online
    socket.broadcast.emit('user:online', userStatusData);

    // Notifier les rooms que l'utilisateur est online
    userRooms.forEach(room => {
      socket.to(`room:${room._id}`).emit('user:online', { ...userStatusData, roomId: room._id });
    });

    // [USER_DATA_SYNC] Send all users' statuses in the same rooms
    // These fields must stay synchronized with userStatusData and /rooms API populate
    // See docs/specs.md section "Architecture: Sources de données utilisateur"
    const memberUserIds = userRooms.flatMap(r => r.members.map(m => m.userId));
    const uniqueUserIds = [...new Set(memberUserIds.map(id => id.toString()))];

    const usersInSameRooms = await User.find({
      _id: { $in: uniqueUserIds }
    }).select('_id username displayName status statusMessage statusExpiresAt isMuted isOnline isBot appVersion lastClient');

    socket.emit('users:init', {
      users: usersInSameRooms.map(u => ({
        id: u._id,
        username: u.username,
        displayName: u.displayName,
        status: u.status,
        statusMessage: u.statusMessage,
        statusExpiresAt: u.statusExpiresAt,
        isMuted: u.isMuted,
        isOnline: u.isOnline,
        isBot: u.isBot,
        appVersion: u.appVersion,
        lastClient: u.lastClient,
      }))
    });

    // NEW: Rejoindre une room
    socket.on('room:join', async (data: { roomId: string }) => {
      socket.join(`room:${data.roomId}`);
      socket.to(`room:${data.roomId}`).emit('user:joined-room', {
        userId,
        username: socket.username,
        roomId: data.roomId,
      });
    });

    // NEW: Quitter une room
    socket.on('room:leave', async (data: { roomId: string }) => {
      socket.leave(`room:${data.roomId}`);
      socket.to(`room:${data.roomId}`).emit('user:left-room', {
        userId,
        username: socket.username,
        roomId: data.roomId,
      });
    });

    // Typing indicators with auto-timeout after 3s of inactivity
    socket.on('typing:start', (data: { roomId: string }) => {
      const key = `${userId}:${data.roomId}`;

      // Clear existing timeout if any
      const existing = typingTimeouts.get(key);
      if (existing) clearTimeout(existing);

      // Emit to others in room
      socket.to(`room:${data.roomId}`).emit('typing:start', { from: userId, roomId: data.roomId });

      // Auto-stop after timeout (user stopped typing but didn't clear input)
      typingTimeouts.set(key, setTimeout(() => {
        socket.to(`room:${data.roomId}`).emit('typing:stop', { from: userId, roomId: data.roomId });
        typingTimeouts.delete(key);
      }, TYPING_TIMEOUT_MS));
    });

    socket.on('typing:stop', (data: { roomId: string }) => {
      const key = `${userId}:${data.roomId}`;

      // Clear timeout
      const existing = typingTimeouts.get(key);
      if (existing) {
        clearTimeout(existing);
        typingTimeouts.delete(key);
      }

      socket.to(`room:${data.roomId}`).emit('typing:stop', { from: userId, roomId: data.roomId });
    });

    // Message read notification (broadcast to room)
    socket.on('message:read', (data: { roomId: string; messageIds: string[] }) => {
      socket.to(`room:${data.roomId}`).emit('message:read', {
        from: userId,
        roomId: data.roomId,
        messageIds: data.messageIds,
      });
    });

    // Notification de suppression de message (broadcast à la room)
    socket.on('message:delete', (data: { roomId: string; messageId: string }) => {
      socket.to(`room:${data.roomId}`).emit('message:deleted', {
        from: userId,
        roomId: data.roomId,
        messageId: data.messageId,
      });
    });

    // Notification de reaction sur message (broadcast à la room)
    socket.on('message:react', (data: { roomId: string; messageId: string; emoji: string; action: string }) => {
      socket.to(`room:${data.roomId}`).emit('message:reacted', {
        from: userId,
        roomId: data.roomId,
        messageId: data.messageId,
        emoji: data.emoji,
        action: data.action,
      });
    });

    // ===== WebRTC Signaling Events =====

    // Relayer l'offre WebRTC (SDP)
    socket.on('webrtc:offer', async (data: { to: string; offer: unknown }) => {
      const canCall = await canCommunicate(userId, data.to);
      if (!canCall) {
        socket.emit('webrtc:error', { error: 'unauthorized', message: 'You cannot call this user' });
        return;
      }
      io.to(`user:${data.to}`).emit('webrtc:offer', {
        from: userId,
        fromUsername: socket.username,
        offer: data.offer,
      });
    });

    // Relayer la réponse WebRTC (SDP)
    socket.on('webrtc:answer', async (data: { to: string; answer: unknown }) => {
      const canCall = await canCommunicate(userId, data.to);
      if (!canCall) {
        socket.emit('webrtc:error', { error: 'unauthorized', message: 'You cannot call this user' });
        return;
      }
      io.to(`user:${data.to}`).emit('webrtc:answer', {
        from: userId,
        answer: data.answer,
      });
    });

    // Relayer les candidats ICE
    socket.on('webrtc:ice-candidate', async (data: { to: string; candidate: unknown }) => {
      const canCall = await canCommunicate(userId, data.to);
      if (!canCall) {
        // Silently ignore - auth should have failed at offer/answer stage
        return;
      }
      io.to(`user:${data.to}`).emit('webrtc:ice-candidate', {
        from: userId,
        candidate: data.candidate,
      });
    });

    // Fermer la connexion WebRTC
    socket.on('webrtc:close', (data: { to: string }) => {
      // No auth check - always allow closing
      io.to(`user:${data.to}`).emit('webrtc:close', {
        from: userId,
      });
    });

    // ===== Call Signaling Events =====

    // Demande d'appel
    socket.on('call:request', async (data: { to: string; withCamera: boolean }) => {
      const canCall = await canCommunicate(userId, data.to);
      if (!canCall) {
        socket.emit('call:error', { error: 'unauthorized', message: 'You cannot call this user' });
        return;
      }
      io.to(`user:${data.to}`).emit('call:request', {
        from: userId,
        fromUsername: socket.username,
        withCamera: data.withCamera,
      });
    });

    // Acceptation d'appel
    socket.on('call:accept', async (data: { to: string; withCamera: boolean }) => {
      const canCall = await canCommunicate(userId, data.to);
      if (!canCall) {
        socket.emit('call:error', { error: 'unauthorized', message: 'You cannot accept this call' });
        return;
      }
      // Notify the caller
      io.to(`user:${data.to}`).emit('call:accept', {
        from: userId,
        withCamera: data.withCamera,
      });
      // Notify other devices of the same user that call was answered elsewhere
      socket.to(`user:${userId}`).emit('call:answered-elsewhere', {
        answeredBy: socket.id,
        caller: data.to,
      });
    });

    // Rejet d'appel
    socket.on('call:reject', (data: { to: string }) => {
      // No auth check - always allow rejection
      io.to(`user:${data.to}`).emit('call:reject', {
        from: userId,
      });
    });

    // Fin d'appel
    socket.on('call:end', (data: { to: string }) => {
      // No auth check - always allow ending calls
      io.to(`user:${data.to}`).emit('call:end', {
        from: userId,
      });
    });

    // Toggle caméra pendant l'appel
    socket.on('call:toggle-camera', (data: { to: string; enabled: boolean }) => {
      // No auth check - if call was established, toggling camera is allowed
      io.to(`user:${data.to}`).emit('call:toggle-camera', {
        from: userId,
        enabled: data.enabled,
      });
    });

    // Screen share toggle
    socket.on('call:screen-share', (data: { to: string; enabled: boolean; trackId?: string }) => {
      io.to(`user:${data.to}`).emit('call:screen-share', {
        from: userId,
        enabled: data.enabled,
        trackId: data.trackId,
      });
    });

    // ===== End Signaling Events =====

    // ===== Notes Events =====

    // Subscribe to notes updates
    socket.on('note:subscribe', () => {
      socket.join('notes');
    });

    // Unsubscribe from notes updates
    socket.on('note:unsubscribe', () => {
      socket.leave('notes');
    });

    // ===== End Notes Events =====

    // ===== Location Events =====

    // Subscribe to location updates
    socket.on('location:subscribe', () => {
      socket.join('locations');
      console.log(`User ${socket.username} subscribed to locations`);
    });

    // Unsubscribe from location updates
    socket.on('location:unsubscribe', () => {
      socket.leave('locations');
      console.log(`User ${socket.username} unsubscribed from locations`);
    });

    // ===== End Location Events =====

    // Déconnexion
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.username}`);

      // Check if user has other active sockets before marking offline
      const allSockets = await io.fetchSockets();
      const hasOtherSockets = allSockets.some(
        s => (s as any).userId === userId && s.id !== socket.id
      );

      if (!hasOtherSockets) {
        await User.findByIdAndUpdate(userId, {
          isOnline: false,
          lastSeen: new Date(),
        });

        socket.broadcast.emit('user:offline', { userId });

        // Notifier les rooms que l'utilisateur est offline
        userRooms.forEach(room => {
          socket.to(`room:${room._id}`).emit('user:offline', { userId, roomId: room._id });
        });
      }

      // Clean up typing timeouts for this user
      for (const [key, timeout] of typingTimeouts.entries()) {
        if (key.startsWith(`${userId}:`)) {
          clearTimeout(timeout);
          typingTimeouts.delete(key);
        }
      }
    });
  });

  return io;
}
