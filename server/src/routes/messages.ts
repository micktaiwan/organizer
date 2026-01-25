/**
 * [USER_DATA_SYNC] Member populates use user fields.
 * These fields must stay synchronized with socket events (users:init, user:online).
 * See docs/specs.md section "Architecture: Sources de données utilisateur".
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { Message, Room, ALLOWED_EMOJIS } from '../models/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { emitNewMessage } from '../utils/socketEmit.js';

const router = Router();
router.use(authMiddleware);

const sendMessageSchema = z.object({
  roomId: z.string(),
  type: z.enum(['text', 'audio', 'system']).default('text'),
  content: z.string().min(1),
  clientSource: z.enum(['desktop', 'android', 'api']).optional(),
});

// POST /messages - Send message to room
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = sendMessageSchema.parse(req.body);

    // Verify user is member of room
    const room = await Room.findById(data.roomId);
    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    const isMember = room.members.some(m => m.userId.toString() === req.userId);
    const isPublic = room.type === 'public' || room.type === 'lobby';

    if (!isMember && !isPublic) {
      res.status(403).json({ error: 'Accès non autorisé' });
      return;
    }

    // Auto-join public rooms when sending a message
    if (!isMember && isPublic) {
      room.members.push({
        userId: req.userId as any,
        joinedAt: new Date(),
        lastReadAt: null,
      });
      await room.save();
      await room.populate('members.userId', 'username displayName isOnline isBot');
      await room.populate('createdBy', 'username displayName');
      console.log(`User ${req.userId} auto-joined public room ${room.name}`);

      // Notify all clients about room update
      const io = req.app.get('io');
      if (io) {
        io.emit('room:updated', { room });
      }
    }

    const message = new Message({
      roomId: data.roomId,
      senderId: req.userId,
      type: data.type,
      content: data.content,
      status: 'sent',
      readBy: [],
      clientSource: data.clientSource,
    });

    await message.save();
    await message.populate('senderId', 'username displayName isOnline status statusMessage');

    // Update room's lastMessageAt for sorting
    await Room.findByIdAndUpdate(data.roomId, { lastMessageAt: new Date() });

    // Emit socket event so connected clients receive the message
    const io = req.app.get('io');
    if (io) {
      await emitNewMessage({
        io,
        roomId: data.roomId,
        userId: req.userId!,
        message: message as any,
      });
    }

    res.status(201).json({ message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
  }
});

// GET /messages/:id - Get a single message by ID
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const message = await Message.findById(req.params.id)
      .populate('senderId', 'username displayName isOnline status statusMessage')
      .populate('reactions.userId', 'username displayName');

    if (!message) {
      res.status(404).json({ error: 'Message non trouvé' });
      return;
    }

    // Verify user has access to this message's room
    const room = await Room.findById(message.roomId);
    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    const isMember = room.members.some(m => m.userId.toString() === req.userId);
    const isPublic = room.type === 'public' || room.type === 'lobby';

    if (!isMember && !isPublic) {
      res.status(403).json({ error: 'Accès non autorisé' });
      return;
    }

    res.json({ message });
  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /messages/:id/read - Mark message as read
router.patch('/:id/read', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      res.status(404).json({ error: 'Message non trouvé' });
      return;
    }

    // Don't mark own messages as read
    if (message.senderId.toString() === req.userId) {
      res.json({ message });
      return;
    }

    // Add to readBy if not already there
    if (!message.readBy.some(id => id.toString() === req.userId)) {
      message.readBy.push(req.userId as any);
      await message.save();

      // Broadcast read status to room via socket
      const io = req.app.get('io');
      if (io) {
        io.to(`room:${message.roomId}`).emit('message:read', {
          from: req.userId,
          roomId: message.roomId.toString(),
          messageIds: [message._id.toString()],
        });
      }
    }

    res.json({ message });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const reactSchema = z.object({
  emoji: z.enum(['👍', '❤️', '😂', '😮', '😢', '😡', '✅', '⚠️', '🙏', '🎉', '👋', '😘']),
});

// POST /messages/:id/react - Toggle reaction on message
router.post('/:id/react', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { emoji } = reactSchema.parse(req.body);
    const message = await Message.findById(req.params.id);

    if (!message) {
      res.status(404).json({ error: 'Message non trouvé' });
      return;
    }

    // Find existing reaction from this user
    const existingIndex = message.reactions.findIndex(
      r => r.userId.toString() === req.userId
    );

    let action: 'added' | 'removed' | 'replaced';

    if (existingIndex >= 0) {
      if (message.reactions[existingIndex].emoji === emoji) {
        // Same emoji - remove reaction (toggle off)
        message.reactions.splice(existingIndex, 1);
        action = 'removed';
      } else {
        // Different emoji - replace
        message.reactions[existingIndex].emoji = emoji;
        message.reactions[existingIndex].createdAt = new Date();
        action = 'replaced';
      }
    } else {
      // No existing reaction - add new
      message.reactions.push({
        userId: req.userId as any,
        emoji,
        createdAt: new Date(),
      });
      action = 'added';
    }

    await message.save();
    await message.populate('senderId', 'username displayName isOnline status statusMessage');
    await message.populate('reactions.userId', 'username displayName');

    res.json({
      message,
      action,
      roomId: message.roomId.toString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Emoji invalide', details: error.errors });
      return;
    }
    console.error('React to message error:', error);
    res.status(500).json({ error: 'Erreur lors de la réaction' });
  }
});

// POST /messages/read-bulk - Mark multiple messages as read
router.post('/read-bulk', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { messageIds, roomId } = req.body;

    if (!Array.isArray(messageIds)) {
      res.status(400).json({ error: 'messageIds doit être un tableau' });
      return;
    }

    await Message.updateMany(
      {
        _id: { $in: messageIds },
        senderId: { $ne: new Types.ObjectId(req.userId) },
      },
      {
        $addToSet: { readBy: new Types.ObjectId(req.userId) },
      }
    );

    // Broadcast read status to room via socket
    const io = req.app.get('io');
    if (roomId && io) {
      io.to(`room:${roomId}`).emit('message:read', {
        from: req.userId,
        roomId,
        messageIds,
      });

      // Send unread count update to the reader
      const unreadCount = await Message.countDocuments({
        roomId: new Types.ObjectId(roomId),
        senderId: { $ne: new Types.ObjectId(req.userId) },
        readBy: { $ne: new Types.ObjectId(req.userId) },
      });
      io.to(`user:${req.userId}`).emit('unread:updated', { roomId, unreadCount });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Bulk read error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /messages/:id - Delete a message
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      res.status(404).json({ error: 'Message non trouvé' });
      return;
    }

    // Only sender can delete their own message
    if (message.senderId.toString() !== req.userId) {
      res.status(403).json({ error: 'Non autorisé à supprimer ce message' });
      return;
    }

    // Delete associated file if it's an image or audio (not a Base64 data URL)
    if ((message.type === 'image' || message.type === 'audio') && message.content) {
      const content = message.content;

      // Only delete if it's a file path (starts with /uploads/), not a Base64 data URL
      if (content.startsWith('/uploads/')) {
        const filePath = path.join(process.cwd(), 'public', content);

        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`✓ Deleted file: ${filePath}`);
          }
        } catch (fileError) {
          console.error('Failed to delete file:', fileError);
          // Continue with message deletion even if file deletion fails
        }
      }
    }

    const roomId = message.roomId.toString();
    await Message.findByIdAndDelete(req.params.id);

    // Update unread counts for all room members
    const room = await Room.findById(roomId);
    if (room) {
      const io = req.app.get('io');
      if (io) {
        for (const member of room.members) {
          const memberId = member.userId.toString();
          // Recalculate unread count for this member
          const unreadCount = await Message.countDocuments({
            roomId: new Types.ObjectId(roomId),
            senderId: { $ne: new Types.ObjectId(memberId) },
            readBy: { $ne: new Types.ObjectId(memberId) },
          });
          io.to(`user:${memberId}`).emit('unread:updated', { roomId, unreadCount });
        }
      }
    }

    res.json({ success: true, roomId, messageId: req.params.id });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

export default router;
