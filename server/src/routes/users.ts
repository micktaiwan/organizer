import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { User, LocationHistory, Track, Room, Message } from '../models/index.js';
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

// GET /users/locations - Récupérer tous les utilisateurs avec leur position et statut
// IMPORTANT: Cette route doit être AVANT /users/:id sinon "locations" sera interprété comme un id
router.get('/locations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find({ 'location.lat': { $exists: true } })
      .select('username displayName isOnline location appVersion status statusMessage statusExpiresAt isTracking trackingExpiresAt currentTrackId')
      .sort({ 'location.updatedAt': -1 });

    const now = new Date();
    const usersWithCheckedStatus = users.map((user) => {
      const userObj = user.toObject();
      // Vérifier si le statut a expiré
      if (userObj.statusExpiresAt && new Date(userObj.statusExpiresAt) <= now) {
        return {
          ...userObj,
          status: 'available',
          statusMessage: null,
          statusExpiresAt: null,
        };
      }
      return userObj;
    });

    res.json({ users: usersWithCheckedStatus });
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des positions' });
  }
});

// GET /users/:userId/location-history - Récupérer l'historique des positions d'un utilisateur
// IMPORTANT: Cette route doit être AVANT /users/:id sinon "location-history" sera interprété comme un id
router.get('/:userId/location-history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50); // Default 10, max 50

    // Valider que userId est un ObjectId valide
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'ID utilisateur invalide' });
      return;
    }

    const history = await LocationHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('lat lng accuracy street city country createdAt');

    res.json({
      history: history.map((h) => ({
        lat: h.lat,
        lng: h.lng,
        accuracy: h.accuracy,
        street: h.street,
        city: h.city,
        country: h.country,
        createdAt: h.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get location history error:', error);
    res.status(500).json({ error: "Erreur lors de la récupération de l'historique" });
  }
});

// GET /users/tracks - Récupérer tous les tracks (historique)
router.get('/tracks', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string | undefined;

    // Build query
    const query: Record<string, unknown> = {};
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ error: 'ID utilisateur invalide' });
        return;
      }
      query.userId = userId;
    }

    // Get tracks with user info
    const tracks = await Track.find(query)
      .sort({ startedAt: -1 })
      .limit(50)
      .lean();

    // Get user info for all tracks
    const userIds = [...new Set(tracks.map((t) => t.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('username displayName')
      .lean();

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const tracksWithUserInfo = tracks.map((track) => {
      const user = userMap.get(track.userId.toString());
      return {
        id: track._id,
        userId: track.userId,
        username: user?.username || 'unknown',
        displayName: user?.displayName || 'Unknown',
        startedAt: track.startedAt,
        endedAt: track.endedAt,
        isActive: track.isActive,
        pointsCount: track.points.length,
      };
    });

    res.json({ tracks: tracksWithUserInfo });
  } catch (error) {
    console.error('Get tracks error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des tracks' });
  }
});

// GET /users/tracks/:trackId - Récupérer un track spécifique par son ID
router.get('/tracks/:trackId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { trackId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(trackId)) {
      res.status(400).json({ error: 'ID track invalide' });
      return;
    }

    const track = await Track.findById(trackId).lean();
    if (!track) {
      res.status(404).json({ error: 'Track non trouvé' });
      return;
    }

    // Get user info
    const user = await User.findById(track.userId).select('username displayName').lean();

    res.json({
      track: {
        id: track._id,
        userId: track.userId,
        username: user?.username || 'unknown',
        displayName: user?.displayName || 'Unknown',
        points: track.points,
        startedAt: track.startedAt,
        endedAt: track.endedAt,
        isActive: track.isActive,
      },
    });
  } catch (error) {
    console.error('Get track by id error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du track' });
  }
});

// GET /users/:userId/track - Récupérer le track actif d'un utilisateur
// IMPORTANT: Cette route doit être AVANT /users/:id
router.get('/:userId/track', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'ID utilisateur invalide' });
      return;
    }

    const user = await User.findById(userId).select('isTracking currentTrackId displayName');
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    if (!user.isTracking || !user.currentTrackId) {
      res.json({ track: null });
      return;
    }

    const track = await Track.findById(user.currentTrackId);
    if (!track) {
      res.json({ track: null });
      return;
    }

    res.json({
      track: {
        id: track._id,
        userId: track.userId,
        points: track.points,
        startedAt: track.startedAt,
        isActive: track.isActive,
      },
    });
  } catch (error) {
    console.error('Get track error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du track' });
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
    const { status, statusMessage, isMuted, expiresAt } = req.body;

    // Validation du statut
    const validStatuses = ['available', 'busy', 'away', 'dnd'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: 'Statut invalide' });
      return;
    }

    // Validation de l'expiration
    let statusExpiresAt: Date | null = null;
    if (expiresAt !== undefined && expiresAt !== null) {
      const expirationDate = new Date(expiresAt);
      if (isNaN(expirationDate.getTime())) {
        res.status(400).json({ error: 'Date d\'expiration invalide' });
        return;
      }
      if (expirationDate <= new Date()) {
        res.status(400).json({ error: 'La date d\'expiration doit être dans le futur' });
        return;
      }
      statusExpiresAt = expirationDate;
    }

    const updates: Record<string, unknown> = {};
    if (status !== undefined) {
      updates.status = status;
      // When setting to "available", clear message and expiration
      if (status === 'available') {
        updates.statusMessage = statusMessage ?? null;
        updates.statusExpiresAt = statusExpiresAt ?? null;
      }
    }
    if (statusMessage !== undefined) updates.statusMessage = statusMessage;
    if (isMuted !== undefined) updates.isMuted = isMuted;
    if (expiresAt !== undefined) updates.statusExpiresAt = statusExpiresAt;

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
        statusExpiresAt: user.statusExpiresAt,
        isMuted: user.isMuted,
      });
    }

    res.json({
      success: true,
      user: {
        status: user.status,
        statusMessage: user.statusMessage,
        statusExpiresAt: user.statusExpiresAt,
        isMuted: user.isMuted,
      },
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du statut' });
  }
});

// PUT /users/location - Mettre à jour sa position
router.put('/location', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { lat, lng, accuracy, street, city, country } = req.body;

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

    // Sauvegarder dans l'historique
    const lastPosition = await LocationHistory.findOne({ userId: req.userId })
      .sort({ createdAt: -1 })
      .select('street city accuracy');

    const newStreet = street || null;
    const newCity = city || null;
    const newAccuracy = typeof accuracy === 'number' ? accuracy : null;

    const hasAddressChanged = !lastPosition ||
      lastPosition.street !== newStreet ||
      lastPosition.city !== newCity;

    if (hasAddressChanged) {
      // Nouvelle adresse → créer une entrée
      await LocationHistory.create({
        userId: req.userId,
        lat,
        lng,
        accuracy: newAccuracy,
        street: newStreet,
        city: newCity,
        country: country || null,
      });
    } else if (newAccuracy !== null) {
      // Même adresse → mettre à jour si meilleure accuracy
      const lastAccuracy = lastPosition.accuracy;
      const isBetterAccuracy = lastAccuracy === null || newAccuracy < lastAccuracy;

      if (isBetterAccuracy) {
        await LocationHistory.findByIdAndUpdate(lastPosition._id, {
          lat,
          lng,
          accuracy: newAccuracy,
        });
      }
    }

    // Si l'utilisateur est en mode tracking, ajouter le point au track actif
    if (user.isTracking && user.currentTrackId) {
      const trackPoint = {
        lat,
        lng,
        accuracy: newAccuracy,
        timestamp: new Date(),
      };

      await Track.findByIdAndUpdate(user.currentTrackId, {
        $push: { points: trackPoint },
      });

      // Émettre le nouveau point de track via Socket.io
      const io = req.app.get('io');
      if (io) {
        io.emit('user:track-point', {
          userId: req.userId,
          trackId: user.currentTrackId,
          point: trackPoint,
        });
      }
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

// PUT /users/tracking - Activer/désactiver le mode suivi en temps réel
router.put('/tracking', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { enabled, expiresIn } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'Le champ enabled est requis' });
      return;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const io = req.app.get('io');

    if (enabled) {
      // Activer le tracking
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 60 * 1000)
        : null;

      // Créer un nouveau track
      const track = await Track.create({
        userId: req.userId,
        points: [],
        startedAt: new Date(),
        isActive: true,
      });

      // Mettre à jour l'utilisateur
      user.isTracking = true;
      user.trackingExpiresAt = expiresAt;
      user.currentTrackId = track._id as mongoose.Types.ObjectId;
      await user.save();

      // TODO: Envoyer un message au lobby (désactivé pour l'instant)
      // const lobby = await Room.findOne({ isLobby: true });
      // if (lobby) {
      //   const systemMessage = await Message.create({
      //     roomId: lobby._id,
      //     senderId: req.userId,
      //     type: 'system',
      //     content: `🛤️ ${user.displayName} a activé le suivi en temps réel`,
      //   });
      //
      //   if (io) {
      //     io.to(`room:${lobby._id}`).emit('message:new', {
      //       message: systemMessage,
      //       roomId: lobby._id,
      //     });
      //   }
      // }

      // Émettre l'événement tracking changed
      if (io) {
        io.emit('user:tracking-changed', {
          userId: req.userId,
          username: user.username,
          displayName: user.displayName,
          isTracking: true,
          trackingExpiresAt: expiresAt,
          trackId: track._id,
        });
      }

      res.json({
        success: true,
        isTracking: true,
        trackingExpiresAt: expiresAt,
        trackId: track._id,
      });
    } else {
      // Désactiver le tracking
      if (user.currentTrackId) {
        await Track.findByIdAndUpdate(user.currentTrackId, {
          isActive: false,
          endedAt: new Date(),
        });
      }

      user.isTracking = false;
      user.trackingExpiresAt = null;
      user.currentTrackId = null;
      await user.save();

      // TODO: Envoyer un message au lobby (désactivé pour l'instant)
      // const lobby = await Room.findOne({ isLobby: true });
      // if (lobby) {
      //   const systemMessage = await Message.create({
      //     roomId: lobby._id,
      //     senderId: req.userId,
      //     type: 'system',
      //     content: `🛤️ ${user.displayName} a désactivé le suivi`,
      //   });
      //
      //   if (io) {
      //     io.to(`room:${lobby._id}`).emit('message:new', {
      //       message: systemMessage,
      //       roomId: lobby._id,
      //     });
      //   }
      // }

      // Émettre l'événement tracking changed
      if (io) {
        io.emit('user:tracking-changed', {
          userId: req.userId,
          username: user.username,
          displayName: user.displayName,
          isTracking: false,
          trackingExpiresAt: null,
          trackId: null,
        });
      }

      res.json({
        success: true,
        isTracking: false,
      });
    }
  } catch (error) {
    console.error('Update tracking error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du suivi' });
  }
});

// POST /users/tracks/sync - Sync a complete track from an offline client
router.post('/tracks/sync', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { localTrackId, startedAt, stoppedAt, points } = req.body;

    // Validation
    if (!localTrackId || !startedAt || !stoppedAt || !Array.isArray(points)) {
      res.status(400).json({
        success: false,
        error: 'Champs requis: localTrackId, startedAt, stoppedAt, points'
      });
      return;
    }

    if (points.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Le track doit contenir au moins un point'
      });
      return;
    }

    // Check for duplicate: track with same user and startedAt within 5 seconds
    const startedAtDate = new Date(startedAt);
    const existingTrack = await Track.findOne({
      userId: req.userId,
      startedAt: {
        $gte: new Date(startedAtDate.getTime() - 5000),
        $lte: new Date(startedAtDate.getTime() + 5000)
      }
    });

    if (existingTrack) {
      console.log(`Track sync skipped: duplicate found (existing: ${existingTrack._id}, local: ${localTrackId})`);
      res.json({
        success: true,
        trackId: existingTrack._id,
        duplicate: true
      });
      return;
    }

    // Create track with all its points
    const trackPoints = points.map((p: { lat: number; lng: number; accuracy?: number; timestamp: number; street?: string; city?: string; country?: string }) => ({
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      timestamp: new Date(p.timestamp),
      street: p.street,
      city: p.city,
      country: p.country,
    }));

    const track = await Track.create({
      userId: req.userId,
      points: trackPoints,
      startedAt: new Date(startedAt),
      endedAt: new Date(stoppedAt),
      isActive: false,
    });

    console.log(`Synced track ${track._id} from local ${localTrackId}: ${points.length} points`);

    res.json({
      success: true,
      trackId: track._id,
    });
  } catch (error) {
    console.error('Sync track error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la synchronisation du track'
    });
  }
});

// PUT /users/tracks/:trackId - Update a track with final points from local DB (source of truth)
router.put('/tracks/:trackId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { trackId } = req.params;
    const { points, endedAt } = req.body;

    if (!mongoose.Types.ObjectId.isValid(trackId)) {
      res.status(400).json({ success: false, error: 'ID track invalide' });
      return;
    }

    if (!Array.isArray(points) || points.length === 0) {
      res.status(400).json({ success: false, error: 'Points requis' });
      return;
    }

    const track = await Track.findById(trackId);
    if (!track) {
      res.status(404).json({ success: false, error: 'Track non trouvé' });
      return;
    }

    // Check ownership
    if (track.userId.toString() !== req.userId) {
      res.status(403).json({ success: false, error: 'Non autorisé' });
      return;
    }

    // Replace points with local DB points (source of truth)
    const trackPoints = points.map((p: { lat: number; lng: number; accuracy?: number; timestamp: number; street?: string; city?: string; country?: string }) => ({
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      timestamp: new Date(p.timestamp),
      street: p.street,
      city: p.city,
      country: p.country,
    }));

    await Track.findByIdAndUpdate(trackId, {
      points: trackPoints,
      endedAt: endedAt ? new Date(endedAt) : new Date(),
      isActive: false,
    });

    console.log(`Updated track ${trackId} with ${points.length} points from local DB`);

    res.json({
      success: true,
      trackId: trackId,
    });
  } catch (error) {
    console.error('Update track error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du track'
    });
  }
});

// DELETE /users/tracks/:trackId - Delete a track (owner or admin only)
router.delete('/tracks/:trackId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { trackId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(trackId)) {
      res.status(400).json({ error: 'ID track invalide' });
      return;
    }

    const track = await Track.findById(trackId);
    if (!track) {
      res.status(404).json({ error: 'Track non trouvé' });
      return;
    }

    // Check permissions: owner or admin
    const currentUser = await User.findById(req.userId).select('isAdmin');
    const isOwner = track.userId.toString() === req.userId;
    const isAdmin = currentUser?.isAdmin === true;

    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: 'Non autorisé à supprimer ce track' });
      return;
    }

    await Track.findByIdAndDelete(trackId);
    console.log(`Track ${trackId} deleted by user ${req.userId} (owner: ${isOwner}, admin: ${isAdmin})`);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete track error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du track' });
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
