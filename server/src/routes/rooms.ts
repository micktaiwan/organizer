/**
 * [USER_DATA_SYNC] Member populates use user fields.
 * These fields must stay synchronized with socket events (users:init, user:online).
 * See docs/specs.md section "Architecture: Sources de données utilisateur".
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Room, User, Message } from '../models/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const createRoomSchema = z.object({
  name: z.string()
    .min(1, 'Le nom est requis')
    .max(100, 'Le nom ne doit pas dépasser 100 caractères')
    .transform(s => s.trim())
    .refine(s => s.length > 0, 'Le nom ne peut pas être vide'),
  type: z.enum(['public', 'private']),
  memberIds: z.array(z.string()).optional(),
});

// GET /rooms - List all rooms user can access
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Find rooms where user is a member OR public rooms
    const rooms = await Room.find({
      $or: [
        { 'members.userId': req.userId },
        { type: 'public' },
        { type: 'lobby' },
      ],
    })
      .populate('createdBy', 'username displayName')
      .populate('members.userId', 'username displayName isOnline isBot')
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    // Calculate unread counts for rooms where user is a member
    const memberRoomIds = rooms
      .filter(room => room.members.some(m => m.userId._id?.toString() === req.userId))
      .map(room => room._id);

    const unreadCounts = await Message.aggregate([
      {
        $match: {
          roomId: { $in: memberRoomIds },
          senderId: { $ne: new Types.ObjectId(req.userId) },
          readBy: { $ne: new Types.ObjectId(req.userId) },
        },
      },
      {
        $group: {
          _id: '$roomId',
          count: { $sum: 1 },
        },
      },
    ]);

    // Create a map for quick lookup
    const unreadMap = new Map(
      unreadCounts.map(item => [item._id.toString(), item.count])
    );

    // Add unreadCount to each room
    const roomsWithUnread = rooms.map(room => ({
      ...room.toObject(),
      unreadCount: unreadMap.get(room._id.toString()) || 0,
    }));

    res.json({ rooms: roomsWithUnread });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des salons' });
  }
});

// GET /rooms/:roomId - Get room details
router.get('/:roomId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await Room.findById(req.params.roomId)
      .populate('createdBy', 'username displayName')
      .populate('members.userId', 'username displayName isOnline isBot lastSeen');

    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    // Check access
    const isMember = room.members.some(m => m.userId._id?.toString() === req.userId);
    const isPublic = room.type === 'public' || room.type === 'lobby';

    if (!isMember && !isPublic) {
      res.status(403).json({ error: 'Accès non autorisé' });
      return;
    }

    res.json({ room });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /rooms - Create a new room
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createRoomSchema.parse(req.body);

    // For private rooms, ensure exactly 2 members (creator + one other)
    if (data.type === 'private') {
      if (!data.memberIds || data.memberIds.length !== 1) {
        res.status(400).json({ error: 'Une conversation privée nécessite exactement 1 destinataire' });
        return;
      }

      const otherUserId = data.memberIds[0];

      // Check if private room already exists between these 2 users
      const existing = await Room.findOne({
        type: 'private',
        members: {
          $all: [
            { $elemMatch: { userId: req.userId } },
            { $elemMatch: { userId: otherUserId } },
          ],
        },
      });

      if (existing) {
        res.status(200).json({ room: existing });
        return;
      }

      // Create private room
      const room = new Room({
        name: data.name,
        type: 'private',
        createdBy: req.userId,
        members: [
          { userId: req.userId, joinedAt: new Date(), lastReadAt: null },
          { userId: otherUserId, joinedAt: new Date(), lastReadAt: null },
        ],
      });

      await room.save();
      await room.populate('members.userId', 'username displayName isOnline isBot');

      res.status(201).json({ room });
    } else {
      // Public room - check for duplicate name
      const existingRoom = await Room.findOne({
        name: data.name,
        type: 'public',
      });

      if (existingRoom) {
        res.status(409).json({ error: 'Un salon public avec ce nom existe déjà' });
        return;
      }

      const room = new Room({
        name: data.name,
        type: 'public',
        createdBy: req.userId,
        members: [
          { userId: req.userId, joinedAt: new Date(), lastReadAt: null },
        ],
      });

      await room.save();
      await room.populate('members.userId', 'username displayName isOnline isBot');
      await room.populate('createdBy', 'username displayName');

      // Emit socket event to notify all connected users
      const io = req.app.get('io');
      if (io) {
        io.emit('room:created', { room });
      }

      res.status(201).json({ room });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.errors });
      return;
    }
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Erreur lors de la création du salon' });
  }
});

// POST /rooms/:roomId/join - Join a room
router.post('/:roomId/join', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    // Check if already a member
    const isMember = room.members.some(m => m.userId.toString() === req.userId);
    if (isMember) {
      res.status(400).json({ error: 'Vous êtes déjà membre de ce salon' });
      return;
    }

    // Private rooms can't be joined (invitation only)
    if (room.type === 'private') {
      res.status(403).json({ error: 'Les conversations privées sont sur invitation uniquement' });
      return;
    }

    // Add member
    room.members.push({
      userId: req.userId as any,
      joinedAt: new Date(),
      lastReadAt: null,
    });
    await room.save();
    await room.populate('members.userId', 'username displayName isOnline isBot');
    await room.populate('createdBy', 'username displayName');

    // Notify all clients about room update
    const io = req.app.get('io');
    if (io) {
      io.emit('room:updated', { room });
    }

    res.json({ room });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /rooms/:roomId/leave - Leave a room
router.post('/:roomId/leave', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    // Can't leave lobby
    if (room.isLobby) {
      res.status(400).json({ error: 'Vous ne pouvez pas quitter le lobby' });
      return;
    }

    // Remove member
    room.members = room.members.filter(m => m.userId.toString() !== req.userId);
    await room.save();
    await room.populate('members.userId', 'username displayName isOnline isBot');
    await room.populate('createdBy', 'username displayName');

    // Notify all clients about room update
    const io = req.app.get('io');
    if (io) {
      io.emit('room:updated', { room });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /rooms/:roomId - Delete a room (creator only)
router.delete('/:roomId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    // Can't delete lobby
    if (room.isLobby || room.type === 'lobby') {
      res.status(403).json({ error: 'Le lobby ne peut pas être supprimé' });
      return;
    }

    // Only creator can delete
    if (room.createdBy.toString() !== req.userId) {
      res.status(403).json({ error: 'Seul le créateur peut supprimer ce salon' });
      return;
    }

    const { Message } = await import('../models/index.js');
    const fs = await import('fs/promises');
    const path = await import('path');

    // Find all messages to get file paths
    const messages = await Message.find({ roomId: req.params.roomId });

    // Delete associated files (images, audio)
    const uploadsDir = path.default.join(process.cwd(), 'public', 'uploads');
    for (const message of messages) {
      if (message.type === 'image' || message.type === 'audio') {
        // Content contains the file URL like /uploads/filename.ext
        const urlPath = message.content;
        if (urlPath && urlPath.startsWith('/uploads/')) {
          const filename = urlPath.replace('/uploads/', '');
          const filePath = path.default.join(uploadsDir, filename);
          try {
            await fs.default.unlink(filePath);
            console.log(`Deleted file: ${filePath}`);
          } catch (err) {
            // File might not exist, continue anyway
            console.log(`Could not delete file: ${filePath}`);
          }
        }
      }
    }

    // Delete all messages for this room
    const deleteResult = await Message.deleteMany({ roomId: req.params.roomId });
    console.log(`Deleted ${deleteResult.deletedCount} messages for room ${room.name}`);

    // Delete the room
    await Room.findByIdAndDelete(req.params.roomId);
    console.log(`Deleted room: ${room.name}`);

    // Emit socket event to notify all connected users
    const io = req.app.get('io');
    if (io) {
      io.emit('room:deleted', { roomId: req.params.roomId, roomName: room.name });
    }

    res.json({ success: true, message: 'Salon supprimé avec succès' });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du salon' });
  }
});

// GET /rooms/:roomId/messages - Get room message history
router.get('/:roomId/messages', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    // Check access
    const isMember = room.members.some(m => m.userId.toString() === req.userId);
    const isPublic = room.type === 'public' || room.type === 'lobby';

    if (!isMember && !isPublic) {
      res.status(403).json({ error: 'Accès non autorisé' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const before = req.query.before as string;

    const query: Record<string, unknown> = { roomId: req.params.roomId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const { Message } = await import('../models/index.js');
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'username displayName isOnline status statusMessage');

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get room messages error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /rooms/:roomId/read - Mark all messages in room as read
router.post('/:roomId/read', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    // Check if user is a member
    const memberIndex = room.members.findIndex(m => m.userId.toString() === req.userId);
    if (memberIndex === -1) {
      res.status(403).json({ error: 'Vous n\'êtes pas membre de ce salon' });
      return;
    }

    // Update lastReadAt for this member
    room.members[memberIndex].lastReadAt = new Date();
    await room.save();

    // Find unread messages first so we can broadcast their IDs
    const unreadMessages = await Message.find({
      roomId: req.params.roomId,
      senderId: { $ne: new Types.ObjectId(req.userId) },
      readBy: { $ne: new Types.ObjectId(req.userId) },
    }).select('_id');
    const unreadMessageIds = unreadMessages.map(m => m._id.toString());

    // Mark all unread messages as read for this user
    if (unreadMessages.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessages.map(m => m._id) } },
        { $addToSet: { readBy: new Types.ObjectId(req.userId) } }
      );
    }

    // Broadcast read status to room so other users update their UI
    const io = req.app.get('io');
    if (io && unreadMessageIds.length > 0) {
      io.to(`room:${req.params.roomId}`).emit('message:read', {
        from: req.userId,
        roomId: req.params.roomId,
        messageIds: unreadMessageIds,
      });
    }
    if (io) {
      io.to(`user:${req.userId}`).emit('unread:updated', {
        roomId: req.params.roomId,
        unreadCount: 0,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Mark room as read error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /rooms/:roomId/search - Search messages in a room
router.get('/:roomId/search', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    // Check access
    const isMember = room.members.some(m => m.userId.toString() === req.userId);
    const isPublic = room.type === 'public' || room.type === 'lobby';

    if (!isMember && !isPublic) {
      res.status(403).json({ error: 'Accès non autorisé' });
      return;
    }

    const query = req.query.q as string;
    if (!query || query.trim().length === 0) {
      res.status(400).json({ error: 'Le paramètre de recherche est requis' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const { Message } = await import('../models/index.js');
    const roomObjectId = new Types.ObjectId(req.params.roomId);

    // Run both searches in parallel: text search (full words) + regex (partial matches)
    const [textResults, regexResults] = await Promise.all([
      // Text search - fast, uses index, full words only
      Message.find({
        roomId: roomObjectId,
        $text: { $search: query },
      })
        .populate('senderId', 'username displayName avatar')
        .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
        .limit(limit)
        .catch(() => []), // Ignore errors (e.g., no text index)

      // Regex search - slower but finds partial matches
      Message.find({
        roomId: roomObjectId,
        content: { $regex: query, $options: 'i' },
      })
        .populate('senderId', 'username displayName avatar')
        .sort({ createdAt: -1 })
        .limit(limit),
    ]);

    // Merge: text results first (more relevant), then regex-only results
    // Each group sorted by date DESC
    const seenIds = new Set(textResults.map(m => m._id.toString()));
    const results = [
      ...textResults.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ...regexResults
        .filter(m => !seenIds.has(m._id.toString()))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    ].slice(0, limit);

    const total = results.length;

    res.json({ results, total });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

// GET /rooms/:roomId/messages/around - Get messages around a timestamp
router.get('/:roomId/messages/around', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      res.status(404).json({ error: 'Salon non trouvé' });
      return;
    }

    // Check access
    const isMember = room.members.some(m => m.userId.toString() === req.userId);
    const isPublic = room.type === 'public' || room.type === 'lobby';

    if (!isMember && !isPublic) {
      res.status(403).json({ error: 'Accès non autorisé' });
      return;
    }

    const timestamp = req.query.timestamp as string;
    if (!timestamp) {
      res.status(400).json({ error: 'Le paramètre timestamp est requis' });
      return;
    }

    const targetDate = new Date(timestamp);
    if (isNaN(targetDate.getTime())) {
      res.status(400).json({ error: 'Timestamp invalide' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const halfLimit = Math.floor(limit / 2);

    const { Message } = await import('../models/index.js');

    // Get messages before the timestamp
    const messagesBefore = await Message.find({
      roomId: new Types.ObjectId(req.params.roomId),
      createdAt: { $lt: targetDate },
    })
      .sort({ createdAt: -1 })
      .limit(halfLimit)
      .populate('senderId', 'username displayName isOnline status statusMessage');

    // Get messages at or after the timestamp
    const messagesAfter = await Message.find({
      roomId: new Types.ObjectId(req.params.roomId),
      createdAt: { $gte: targetDate },
    })
      .sort({ createdAt: 1 })
      .limit(halfLimit)
      .populate('senderId', 'username displayName isOnline status statusMessage');

    // Combine and sort by createdAt
    const messages = [...messagesBefore.reverse(), ...messagesAfter];

    // Check if there are older/newer messages
    const hasOlder = messagesBefore.length === halfLimit;

    const newerCount = await Message.countDocuments({
      roomId: new Types.ObjectId(req.params.roomId),
      createdAt: { $gt: messagesAfter.length > 0 ? messagesAfter[messagesAfter.length - 1].createdAt : targetDate },
    });
    const hasNewer = newerCount > 0;

    // Find the message closest to the target timestamp
    let targetMessageId: string | null = null;
    if (messagesAfter.length > 0) {
      targetMessageId = messagesAfter[0]._id.toString();
    } else if (messagesBefore.length > 0) {
      targetMessageId = messagesBefore[0]._id.toString();
    }

    res.json({ messages, hasOlder, hasNewer, targetMessageId });
  } catch (error) {
    console.error('Get messages around error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
