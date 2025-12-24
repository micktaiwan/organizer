import { Router, Response } from 'express';
import { z } from 'zod';
import { Room, User } from '../models/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
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
      .populate('members.userId', 'username displayName isOnline')
      .sort({ updatedAt: -1 });

    res.json({ rooms });
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
      .populate('members.userId', 'username displayName isOnline lastSeen');

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
      await room.populate('members.userId', 'username displayName isOnline');

      res.status(201).json({ room });
    } else {
      // Public room
      const room = new Room({
        name: data.name,
        type: 'public',
        createdBy: req.userId,
        members: [
          { userId: req.userId, joinedAt: new Date(), lastReadAt: null },
        ],
      });

      await room.save();
      await room.populate('members.userId', 'username displayName isOnline');

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
    await room.populate('members.userId', 'username displayName isOnline');

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

    res.json({ success: true });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
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

    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string;

    const query: Record<string, unknown> = { roomId: req.params.roomId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const { Message } = await import('../models/index.js');
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'username displayName');

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get room messages error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
