// Session management
import { log } from './logger.mjs';

// Per-user sessions to maintain Claude conversation context
const userSessions = new Map(); // userId -> { sessionId, lastActivity }

// Cleanup inactive sessions (15 minutes timeout)
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

const sessionCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of userSessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      log('info', `[Session] 🧹 Cleaning up inactive session for ${userId}`);
      userSessions.delete(userId);
    }
  }
}, 60 * 1000);

export { userSessions, SESSION_TIMEOUT_MS, sessionCleanupInterval };
