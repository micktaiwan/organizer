import { Router, Response } from 'express';
import { User } from '../models/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Toutes les routes users nécessitent une authentification
router.use(authMiddleware);

// GET /users/search?q=... - Rechercher des utilisateurs
router.get('/search', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      res.status(400).json({ error: 'La recherche doit contenir au moins 2 caractères' });
      return;
    }

    const users = await User.find({
      $and: [
        { _id: { $ne: req.userId } }, // Exclure l'utilisateur courant
        {
          $or: [
            { username: { $regex: query, $options: 'i' } },
            { displayName: { $regex: query, $options: 'i' } },
          ],
        },
      ],
    })
      .select('username displayName isOnline lastSeen')
      .limit(20);

    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

// GET /users/:id - Profil public d'un utilisateur
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id).select(
      'username displayName isOnline lastSeen peerId'
    );

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /users/me - Mettre à jour son profil
router.patch('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const allowedUpdates = ['displayName'];
    const updates: Record<string, unknown> = {};

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Aucune mise à jour fournie' });
      return;
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
      runValidators: true,
    }).select('-passwordHash');

    res.json({ user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

export default router;
