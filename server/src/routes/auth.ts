import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { User } from '../models/index.js';
import { generateToken, generateRefreshToken, verifyRefreshToken, revokeRefreshToken, authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// POST /auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);

    // Vérifier si username ou email existe déjà
    const existingUser = await User.findOne({
      $or: [
        { username: data.username.toLowerCase() },
        { email: data.email.toLowerCase() },
      ],
    });

    if (existingUser) {
      const field = existingUser.username === data.username.toLowerCase() ? 'username' : 'email';
      res.status(400).json({ error: `Ce ${field} est déjà utilisé` });
      return;
    }

    // Hasher le mot de passe
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Vérifier si c'est le premier utilisateur (sera admin)
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;

    // Créer l'utilisateur
    const user = new User({
      username: data.username.toLowerCase(),
      displayName: data.displayName,
      email: data.email.toLowerCase(),
      passwordHash,
      isAdmin: isFirstUser,
    });

    await user.save();

    // Générer les tokens
    const token = generateToken(user._id.toString(), user.username);
    const refreshToken = await generateRefreshToken(user._id.toString());

    res.status(201).json({
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        isAdmin: user.isAdmin,
        isBot: user.isBot,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.issues });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    // Trouver l'utilisateur
    const identifier = data.username.toLowerCase();
    const user = await User.findOne(
      identifier.includes('@') ? { email: identifier } : { username: identifier }
    );

    if (!user) {
      console.log(`[AUTH] Login failed: user "${data.username}" not found`);
      res.status(401).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    // Vérifier le mot de passe
    const isValidPassword = await bcrypt.compare(data.password, user.passwordHash);

    if (!isValidPassword) {
      console.log(`[AUTH] Login failed: wrong password for user "${data.username}"`);
      res.status(401).json({ error: 'Mot de passe incorrect' });
      return;
    }

    // Mettre à jour lastSeen
    user.lastSeen = new Date();
    await user.save();

    // Générer les tokens
    const token = generateToken(user._id.toString(), user.username);
    const refreshToken = await generateRefreshToken(user._id.toString());

    console.log(`[AUTH] Login successful: user "${data.username}"`);

    res.json({
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        isAdmin: user.isAdmin,
        isBot: user.isBot,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Données invalides', details: error.issues });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// POST /auth/refresh - Renouveler l'access token via refresh token
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token manquant' });
      return;
    }

    const result = await verifyRefreshToken(refreshToken);
    if (!result) {
      res.status(401).json({ error: 'Refresh token invalide ou expiré' });
      return;
    }

    const user = await User.findById(result.userId);
    if (!user) {
      res.status(401).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    // Rotation: revoke old, issue new
    await revokeRefreshToken(refreshToken);
    const newToken = generateToken(user._id.toString(), user.username);
    const newRefreshToken = await generateRefreshToken(user._id.toString());

    res.json({
      token: newToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Erreur lors du rafraîchissement du token' });
  }
});

// POST /auth/logout - Révoquer le refresh token
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Erreur lors de la déconnexion' });
  }
});

// GET /auth/me - Récupérer l'utilisateur courant
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({
      user: {
        id: req.user!._id,
        username: req.user!.username,
        displayName: req.user!.displayName,
        email: req.user!.email,
        isAdmin: req.user!.isAdmin,
        isOnline: req.user!.isOnline,
        lastSeen: req.user!.lastSeen,
        status: req.user!.status,
        statusMessage: req.user!.statusMessage,
        statusExpiresAt: req.user!.statusExpiresAt,
        isMuted: req.user!.isMuted,
        isBot: req.user!.isBot,
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
