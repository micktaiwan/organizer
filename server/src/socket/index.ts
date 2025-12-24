import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User, Room } from '../models/index.js';
import { JwtPayload } from '../middleware/auth.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

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
      next();
    } catch (error) {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${socket.username} (${userId})`);

    // Mettre à jour le statut online
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date(),
    });

    // Rejoindre une room personnelle pour WebRTC signaling direct
    socket.join(`user:${userId}`);

    // Rejoindre toutes les rooms de l'utilisateur
    const userRooms = await Room.find({ 'members.userId': userId });
    for (const room of userRooms) {
      socket.join(`room:${room._id}`);
      console.log(`User ${socket.username} joined room: ${room.name}`);
    }

    // Notifier les autres utilisateurs du statut online
    socket.broadcast.emit('user:online', { userId });

    // Notifier les rooms que l'utilisateur est online
    userRooms.forEach(room => {
      socket.to(`room:${room._id}`).emit('user:online', { userId, roomId: room._id });
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

    // MODIFIED: Typing indicators dans les rooms
    socket.on('typing:start', (data: { roomId: string }) => {
      socket.to(`room:${data.roomId}`).emit('typing:start', { from: userId, roomId: data.roomId });
    });

    socket.on('typing:stop', (data: { roomId: string }) => {
      socket.to(`room:${data.roomId}`).emit('typing:stop', { from: userId, roomId: data.roomId });
    });

    // MODIFIED: Notification de nouveau message (broadcast à la room)
    socket.on('message:notify', (data: { roomId: string; messageId: string }) => {
      socket.to(`room:${data.roomId}`).emit('message:new', {
        from: userId,
        roomId: data.roomId,
        messageId: data.messageId,
      });
    });

    // MODIFIED: Notification de message lu (broadcast à la room)
    socket.on('message:read', (data: { roomId: string; messageIds: string[] }) => {
      socket.to(`room:${data.roomId}`).emit('message:read', {
        from: userId,
        roomId: data.roomId,
        messageIds: data.messageIds,
      });
    });

    // ===== WebRTC Signaling Events =====

    // Relayer l'offre WebRTC (SDP)
    socket.on('webrtc:offer', (data: { to: string; offer: unknown }) => {
      io.to(`user:${data.to}`).emit('webrtc:offer', {
        from: userId,
        fromUsername: socket.username,
        offer: data.offer,
      });
    });

    // Relayer la réponse WebRTC (SDP)
    socket.on('webrtc:answer', (data: { to: string; answer: unknown }) => {
      io.to(`user:${data.to}`).emit('webrtc:answer', {
        from: userId,
        answer: data.answer,
      });
    });

    // Relayer les candidats ICE
    socket.on('webrtc:ice-candidate', (data: { to: string; candidate: unknown }) => {
      io.to(`user:${data.to}`).emit('webrtc:ice-candidate', {
        from: userId,
        candidate: data.candidate,
      });
    });

    // Fermer la connexion WebRTC
    socket.on('webrtc:close', (data: { to: string }) => {
      io.to(`user:${data.to}`).emit('webrtc:close', {
        from: userId,
      });
    });

    // ===== Call Signaling Events =====

    // Demande d'appel
    socket.on('call:request', (data: { to: string; withCamera: boolean }) => {
      io.to(`user:${data.to}`).emit('call:request', {
        from: userId,
        fromUsername: socket.username,
        withCamera: data.withCamera,
      });
    });

    // Acceptation d'appel
    socket.on('call:accept', (data: { to: string; withCamera: boolean }) => {
      io.to(`user:${data.to}`).emit('call:accept', {
        from: userId,
        withCamera: data.withCamera,
      });
    });

    // Rejet d'appel
    socket.on('call:reject', (data: { to: string }) => {
      io.to(`user:${data.to}`).emit('call:reject', {
        from: userId,
      });
    });

    // Fin d'appel
    socket.on('call:end', (data: { to: string }) => {
      io.to(`user:${data.to}`).emit('call:end', {
        from: userId,
      });
    });

    // Toggle caméra pendant l'appel
    socket.on('call:toggle-camera', (data: { to: string; enabled: boolean }) => {
      io.to(`user:${data.to}`).emit('call:toggle-camera', {
        from: userId,
        enabled: data.enabled,
      });
    });

    // ===== End Signaling Events =====

    // Déconnexion
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.username}`);

      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });

      socket.broadcast.emit('user:offline', { userId });

      // Notifier les rooms que l'utilisateur est offline
      userRooms.forEach(room => {
        socket.to(`room:${room._id}`).emit('user:offline', { userId, roomId: room._id });
      });
    });
  });

  return io;
}
