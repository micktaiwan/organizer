import { Room, Contact } from '../models/index.js';

// Simple in-memory cache with TTL
interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const authCache = new Map<string, CacheEntry>();

function getCacheKey(userId1: string, userId2: string): string {
  // Sort IDs to ensure consistent key regardless of order
  const sorted = [userId1, userId2].sort();
  return `${sorted[0]}:${sorted[1]}`;
}

function getCachedResult(key: string): boolean | null {
  const entry = authCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    authCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCachedResult(key: string, value: boolean): void {
  authCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Check if two users can communicate (call each other).
 * Users can communicate if:
 * 1. They share a common room, OR
 * 2. They have mutual contacts (A added B AND B added A)
 */
export async function canCommunicate(userId1: string, userId2: string): Promise<boolean> {
  if (userId1 === userId2) {
    return false; // Can't call yourself
  }

  const cacheKey = getCacheKey(userId1, userId2);

  // Check cache first
  const cachedResult = getCachedResult(cacheKey);
  if (cachedResult !== null) {
    return cachedResult;
  }

  try {
    // Check 1: Do they share a common room?
    const sharedRoom = await Room.findOne({
      'members.userId': { $all: [userId1, userId2] },
    }).lean();

    if (sharedRoom) {
      setCachedResult(cacheKey, true);
      return true;
    }

    // Check 2: Are they mutual contacts?
    const [contact1to2, contact2to1] = await Promise.all([
      Contact.findOne({ userId: userId1, contactId: userId2 }).lean(),
      Contact.findOne({ userId: userId2, contactId: userId1 }).lean(),
    ]);

    const areMutualContacts = !!(contact1to2 && contact2to1);
    setCachedResult(cacheKey, areMutualContacts);
    return areMutualContacts;
  } catch (error) {
    console.error('Error checking communication authorization:', error);
    // On error, deny by default for security
    return false;
  }
}

/**
 * Invalidate cache for a user pair.
 * Call this when contacts or room memberships change.
 */
export function invalidateAuthCache(userId1: string, userId2: string): void {
  const cacheKey = getCacheKey(userId1, userId2);
  authCache.delete(cacheKey);
}

/**
 * Clear all cached authorization entries.
 */
export function clearAuthCache(): void {
  authCache.clear();
}
