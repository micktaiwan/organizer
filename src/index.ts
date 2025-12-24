import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { connectDB } from './config/db.js';
import { setupSocket } from './socket/index.js';
import { authRoutes, usersRoutes, contactsRoutes, messagesRoutes, roomsRoutes, adminRoutes } from './routes/index.js';
import { Room, User } from './models/index.js';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/contacts', contactsRoutes);
app.use('/messages', messagesRoutes);
app.use('/rooms', roomsRoutes);
app.use('/admin', adminRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// Setup Socket.io
setupSocket(httpServer);

// Start server
const PORT = process.env.PORT || 3001;

async function ensureLobby() {
  try {
    const lobby = await Room.findOne({ isLobby: true });
    if (!lobby) {
      console.log('Creating lobby room...');

      // Find a system user (first admin or first user)
      let systemUser = await User.findOne({ isAdmin: true });
      if (!systemUser) {
        systemUser = await User.findOne();
      }

      if (systemUser) {
        const allUsers = await User.find({});
        const newLobby = new Room({
          name: 'Lobby',
          type: 'lobby',
          isLobby: true,
          createdBy: systemUser._id,
          members: allUsers.map(u => ({
            userId: u._id,
            joinedAt: new Date(),
            lastReadAt: null,
          })),
        });
        await newLobby.save();
        console.log(`✓ Lobby created with ${allUsers.length} members`);
      }
    }
  } catch (error) {
    console.error('Failed to ensure lobby:', error);
  }
}

async function start() {
  try {
    await connectDB();
    await ensureLobby();

    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Socket.io ready`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
