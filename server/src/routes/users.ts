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

// GET /users/locations - Récupérer tous les utilisateurs avec leur position
// IMPORTANT: Cette route doit être AVANT /users/:id sinon "locations" sera interprété comme un id
router.get('/locations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find({ 'location.lat': { $exists: true } })
      .select('username displayName isOnline location')
      .sort({ 'location.updatedAt': -1 });

    res.json({ users });
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des positions' });
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

// PUT /users/status - Mettre à jour son statut
router.put('/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, statusMessage, isMuted } = req.body;

    // Validation
    const validStatuses = ['available', 'busy', 'away', 'dnd'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: 'Statut invalide' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (statusMessage !== undefined) updates.statusMessage = statusMessage;
    if (isMuted !== undefined) updates.isMuted = isMuted;

    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    // Émettre via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('user:status-changed', {
        userId: req.userId,
        status: user.status,
        statusMessage: user.statusMessage,
        isMuted: user.isMuted,
      });
    }

    res.json({ success: true, user: { status: user.status, statusMessage: user.statusMessage, isMuted: user.isMuted } });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du statut' });
  }
});

// PUT /users/location - Mettre à jour sa position
router.put('/location', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { lat, lng, street, city, country } = req.body;

    // Validation: lat/lng sont requis
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(400).json({ error: 'Latitude et longitude requises' });
      return;
    }

    // Validation: lat entre -90 et 90, lng entre -180 et 180
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'Coordonnées invalides' });
      return;
    }

    const locationUpdate = {
      location: {
        lat,
        lng,
        street: street || null,
        city: city || null,
        country: country || null,
        updatedAt: new Date(),
      },
    };

    const user = await User.findByIdAndUpdate(req.userId, locationUpdate, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    // Émettre via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('user:location-updated', {
        userId: req.userId,
        username: user.username,
        displayName: user.displayName,
        isOnline: user.isOnline,
        location: user.location,
      });
    }

    res.json({ success: true, location: user.location });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la position' });
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
