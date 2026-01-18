import { Router, Response } from 'express';
import { User, Contact, Message } from '../models/index.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { runDigest, getLiveCollectionStats } from '../memory/index.js';

const router = Router();

// Toutes les routes admin nécessitent auth + admin
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /admin/stats - Statistiques générales
router.get('/stats', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      onlineUsers,
      totalContacts,
      totalMessages,
      recentUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isOnline: true }),
      Contact.countDocuments(),
      Message.countDocuments(),
      User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('username displayName createdAt isOnline'),
    ]);

    res.json({
      stats: {
        totalUsers,
        onlineUsers,
        totalContacts,
        totalMessages,
      },
      recentUsers,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /admin/users - Liste tous les utilisateurs
router.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-passwordHash'),
      User.countDocuments(),
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /admin/users/:id - Détails d'un utilisateur
router.get('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const [contactsCount, messagesCount] = await Promise.all([
      Contact.countDocuments({ userId: user._id }),
      Message.countDocuments({
        $or: [{ senderId: user._id }, { receiverId: user._id }],
      }),
    ]);

    res.json({
      user,
      stats: {
        contactsCount,
        messagesCount,
      },
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /admin/users/:id - Modifier un utilisateur
router.patch('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const allowedUpdates = ['displayName', 'isAdmin'];
    const updates: Record<string, unknown> = {};

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // Empêcher de se retirer ses propres droits admin
    if (req.params.id === req.userId && updates.isAdmin === false) {
      res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits admin' });
      return;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select('-passwordHash');

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /admin/users/:id - Supprimer un utilisateur
router.delete('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Empêcher de se supprimer soi-même
    if (req.params.id === req.userId) {
      res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
      return;
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    // Supprimer les données associées
    await Promise.all([
      Contact.deleteMany({ $or: [{ userId: user._id }, { contactId: user._id }] }),
      Message.deleteMany({ $or: [{ senderId: user._id }, { receiverId: user._id }] }),
      user.deleteOne(),
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /admin/messages/stats - Stats des messages
router.get('/messages/stats', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalMessages, todayMessages, messagesByType] = await Promise.all([
      Message.countDocuments(),
      Message.countDocuments({ createdAt: { $gte: today } }),
      Message.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      totalMessages,
      todayMessages,
      messagesByType: messagesByType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    console.error('Admin messages stats error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== Pet Memory Digest =====

// GET /admin/live/stats - Get live collection stats with time span
router.get('/live/stats', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await getLiveCollectionStats();
    res.json({
      collection: 'organizer_live',
      count: stats.count,
      oldestTimestamp: stats.oldestTimestamp,
      newestTimestamp: stats.newestTimestamp,
    });
  } catch (error) {
    console.error('Admin live/stats error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /admin/digest - Force a digest run
router.post('/digest', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await runDigest();
    res.json({
      success: true,
      factsExtracted: result.factsExtracted,
      messagesProcessed: result.messagesProcessed,
    });
  } catch (error) {
    console.error('Admin digest error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
