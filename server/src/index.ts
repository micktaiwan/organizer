import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { connectDB } from './config/db.js';
import { setupSocket } from './socket/index.js';
import { authRoutes, usersRoutes, contactsRoutes, messagesRoutes, roomsRoutes, adminRoutes, apkRoutes, notesRoutes, labelsRoutes } from './routes/index.js';
import uploadRoutes from './routes/upload.js';
import mcpRoutes from './mcp/index.js';
import mcpAdminRoutes from './routes/mcp-admin.js';
import { Room, User } from './models/index.js';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

// Routes
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/contacts', contactsRoutes);
app.use('/messages', messagesRoutes);
app.use('/rooms', roomsRoutes);
app.use('/admin', adminRoutes);
app.use('/apk', apkRoutes);
app.use('/upload', uploadRoutes);
app.use('/notes', notesRoutes);
app.use('/labels', labelsRoutes);
app.use('/mcp', mcpRoutes);
app.use('/mcp-admin', mcpAdminRoutes);

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
const io = setupSocket(httpServer);
app.set('io', io);

// Start server
const PORT = process.env.PORT || 3001;

async function ensureLobby() {
  try {
    let lobby = await Room.findOne({ isLobby: true });

    if (lobby) {
      // Lobby exists, add any new users who aren't members yet
      const allUsers = await User.find({});
      const existingMemberIds = new Set(lobby.members.map(m => m.userId.toString()));

      const newMembers = allUsers.filter(u => !existingMemberIds.has(u._id.toString()));
      if (newMembers.length > 0) {
        newMembers.forEach(user => {
          lobby.members.push({
            userId: user._id,
            joinedAt: new Date(),
            lastReadAt: null,
          });
        });
        await lobby.save();
        console.log(`✓ Added ${newMembers.length} new users to lobby`);
      }
    } else {
      // Create new lobby
      console.log('Creating lobby room...');
      const allUsers = await User.find({});

      if (allUsers.length > 0) {
        const systemUser = allUsers[0];
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
      } else {
        console.log('No users found, lobby will be created when first user registers');
      }
    }
  } catch (error) {
    console.error('Failed to ensure lobby:', error);
  }
}

function ensureUploadDirectories() {
  const imageDir = path.join(process.cwd(), 'public', 'uploads', 'images');
  const fileDir = path.join(process.cwd(), 'public', 'uploads', 'files');

  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
    console.log('✓ Created images upload directory');
  }
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
    console.log('✓ Created files upload directory');
  }
}

async function start() {
  try {
    ensureUploadDirectories();
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
