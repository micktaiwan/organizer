import { Router, Response } from 'express';
import { z } from 'zod';
import { Message, Room } from '../models/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const sendMessageSchema = z.object({
  roomId: z.string(),
  type: z.enum(['text', 'image', 'audio', 'system']).default('text'),
  content: z.string().min(1),
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

    const message = new Message({
      roomId: data.roomId,
      senderId: req.userId,
      type: data.type,
      content: data.content,
      status: 'sent',
      readBy: [],
    });

    await message.save();
    await message.populate('senderId', 'username displayName');

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
    }

    res.json({ message });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /messages/read-bulk - Mark multiple messages as read
router.post('/read-bulk', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds)) {
      res.status(400).json({ error: 'messageIds doit être un tableau' });
      return;
    }

    await Message.updateMany(
      {
        _id: { $in: messageIds },
        senderId: { $ne: req.userId },
      },
      {
        $addToSet: { readBy: req.userId },
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Bulk read error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
