import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { Room, Message, User } from '../models/index.js';
import { indexLiveMessage } from '../memory/live.service.js';
import { handleEkoMention } from './eko-handler.js';

interface MessageEmitData {
  io: Server;
  socket?: Socket; // If provided, uses socket.to() to exclude sender
  roomId: string;
  userId: string;
  message: {
    _id: any;
    senderId: any;
    type?: string;
    content?: string;
    clientSource?: 'desktop' | 'android' | 'api';
  };
}

/**
 * Emit a message:new socket event to all clients in a room
 * Used by both socket handlers and REST API endpoints
 *
 * @param socket - If provided, excludes sender from broadcast (socket.to())
 *                 If not provided, broadcasts to all including sender (io.to())
 */
export async function emitNewMessage({ io, socket, roomId, userId, message }: MessageEmitData) {
  const sender = message.senderId as any;
  const room = await Room.findById(roomId);

  // Generate preview for notifications
  let preview: string;
  switch (message.type) {
    case 'audio':
      preview = '🎤 Message audio';
      break;
    case 'image':
      preview = '🖼️ Image';
      break;
    case 'file':
      preview = '📎 Fichier';
      break;
    default:
      preview = message.content?.substring(0, 100) || 'Nouveau message';
  }

  // Lightweight payload: clients should fetch full message via API
  // Only include data needed for notifications
  const payload = {
    from: userId,
    fromName: sender?.displayName || sender?.username || 'Utilisateur',
    roomName: room?.name || 'Chat',
    roomId: roomId,
    messageId: message._id.toString(),
    preview,
  };

  // Use socket.to() to exclude sender, or io.to() to include all
  const broadcaster = socket ? socket.to(`room:${roomId}`) : io.to(`room:${roomId}`);
  broadcaster.emit('message:new', payload);

  // Emit unread:updated to all room members (except sender)
  if (room) {
    for (const member of room.members) {
      const memberId = member.userId.toString();
      if (memberId !== userId) {
        // Calculate unread count for this member
        const unreadCount = await Message.countDocuments({
          roomId: new Types.ObjectId(roomId),
          senderId: { $ne: new Types.ObjectId(memberId) },
          readBy: { $ne: new Types.ObjectId(memberId) },
        });

        io.to(`user:${memberId}`).emit('unread:updated', {
          roomId,
          unreadCount,
        });
      }
    }

    // Observer: index Lobby messages for pet's live context (text only, skip media)
    // Skip messages mentioning Eko - they're already handled in real-time by the agent
    const mentionsEko = /\beko\b/i.test(message.content || '');
    if (room.isLobby && message.type === 'text' && message.content && !mentionsEko) {
      indexLiveMessage({
        messageId: message._id.toString(),
        content: message.content,
        author: sender?.displayName || sender?.username || 'Unknown',
        authorId: userId,
        room: room.name,
        roomId: roomId,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        console.error('[Live] Failed to index message:', err.message);
      });
    }

    // Detect Eko mentions (case-insensitive, word boundary)
    if (message.type === 'text' && message.content) {
      const containsEko = /\beko\b/i.test(message.content);
      // Don't trigger if Eko is the sender (avoid infinite loops)
      const senderUsername = sender?.username?.toLowerCase();

      if (containsEko && senderUsername !== 'eko') {
        console.log(`[Eko] Mention detected in room ${room.name}`);

        // Trigger Eko response asynchronously (don't block message emission)
        handleEkoMention({
          io,
          roomId,
          messageContent: message.content,
          authorId: userId,
          authorName: sender?.displayName || sender?.username || 'Unknown',
          roomName: room.name,
          clientSource: message.clientSource,
        }).catch((err) => {
          console.error('[Eko] Failed to handle mention:', err.message);
        });
      }
    }
  }
}
