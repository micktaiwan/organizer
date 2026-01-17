import { Server } from 'socket.io';

let io: Server | null = null;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

export function setupLogStreamer(socketServer: Server) {
  io = socketServer;

  // Create logs namespace (no auth required for dev)
  const logsNamespace = io.of('/logs');

  logsNamespace.on('connection', (socket) => {
    console.log('[LogStreamer] Client connected');
    socket.on('disconnect', () => {
      console.log('[LogStreamer] Client disconnected');
    });
  });

  // Override console methods
  console.log = (...args: unknown[]) => {
    originalConsoleLog.apply(console, args);
    emitLog('log', args);
  };

  console.error = (...args: unknown[]) => {
    originalConsoleError.apply(console, args);
    emitLog('error', args);
  };

  console.warn = (...args: unknown[]) => {
    originalConsoleWarn.apply(console, args);
    emitLog('warn', args);
  };
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
