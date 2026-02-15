// Session management
import { log } from './logger.mjs';

// Per-user sessions to maintain Claude conversation context
const userSessions = new Map(); // userId -> { sessionId, lastActivity, queryCount }

// Cleanup inactive sessions (15 minutes timeout)
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

// Reset session after N queries to prevent unbounded context growth
// The agent has memory tools to retrieve past context, so fresh sessions are fine
const MAX_QUERIES_PER_SESSION = 10;

const sessionCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of userSessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      log('info', `[Session] 🧹 Cleaning up inactive session for ${userId}`);
      userSessions.delete(userId);
    }
  }
}, 60 * 1000);

export { userSessions, SESSION_TIMEOUT_MS, MAX_QUERIES_PER_SESSION, sessionCleanupInterval };
