import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { JwtPayload } from '../middleware/auth.js';
import { logger } from './logger.js';

let io: Server | null = null;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

export function setupLogStreamer(socketServer: Server) {
  io = socketServer;

  // Create logs namespace with admin auth
  const logsNamespace = io.of('/logs');

  // Middleware: require admin authentication (skip in dev mode)
  logsNamespace.use(async (socket: Socket, next) => {
    // Skip auth in development mode
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }

    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Token manquant'));
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return next(new Error('Configuration serveur invalide'));
      }

      const decoded = jwt.verify(token, secret) as JwtPayload;
      const user = await User.findById(decoded.userId);

      if (!user) {
        return next(new Error('Utilisateur non trouvé'));
      }

      if (!user.isAdmin) {
        return next(new Error('Accès réservé aux administrateurs'));
      }

      next();
    } catch (error) {
      next(new Error('Token invalide'));
    }
  });

  logsNamespace.on('connection', (socket) => {
    originalConsoleLog('[LogStreamer] Admin client connected');
    socket.on('disconnect', () => {
      originalConsoleLog('[LogStreamer] Admin client disconnected');
    });
  });

  // Override console methods
  console.log = (...args: unknown[]) => {
    originalConsoleLog.apply(console, args);
    const message = formatMessage(args);
    logger.info(message);
    emitLog('log', args);
  };

  console.error = (...args: unknown[]) => {
    originalConsoleError.apply(console, args);
    const message = formatMessage(args);
    logger.error(message);
    emitLog('error', args);
  };

  console.warn = (...args: unknown[]) => {
    originalConsoleWarn.apply(console, args);
    const message = formatMessage(args);
    logger.warn(message);
    emitLog('warn', args);
  };
}

function formatMessage(args: unknown[]): string {
  return args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');
}

function emitLog(level: string, args: unknown[]) {
  if (!io) return;

  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');

  io.of('/logs').emit('log', {
    level,
    message,
    timestamp: new Date().toISOString(),
  });
}
