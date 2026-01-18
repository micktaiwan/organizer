import { User } from '../models/index.js';

// ============================================================================
// Types
// ============================================================================

export interface SearchUsersOptions {
  query: string;
  limit?: number;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Search users by username or display name
 */
export async function searchUsers(options: SearchUsersOptions) {
  const { query, limit = 20 } = options;

  return User.find({
    $or: [
      { username: { $regex: query, $options: 'i' } },
      { displayName: { $regex: query, $options: 'i' } },
    ],
  })
    .select('username displayName isOnline isBot isAdmin lastSeen')
    .limit(limit);
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  return User.findById(userId).select('-passwordHash');
}

/**
 * Get user by username
 */
export async function getUserByUsername(username: string) {
  return User.findOne({ username }).select('-passwordHash');
}
