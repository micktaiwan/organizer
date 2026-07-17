/**
 * Room member userId can be a string, a populated user object, or null when the
 * user was deleted (Mongoose populate yields null for a missing ref).
 * `typeof null === 'object'`, so a plain `typeof x === 'object'` check does not
 * protect against it — always go through these helpers.
 */

interface PopulatedUser {
  id?: string;
  _id?: string;
  username?: string;
  displayName?: string;
  isBot?: boolean;
}

type MemberUserId = string | PopulatedUser | null | undefined;

/** The populated user object, or null if absent (string ref, or deleted user). */
export function getMemberUser(userId: MemberUserId): PopulatedUser | null {
  return userId !== null && typeof userId === 'object' ? userId : null;
}

/** The member's user id, or null if it cannot be resolved. */
export function getMemberUserId(userId: MemberUserId): string | null {
  if (!userId) return null;
  if (typeof userId === 'string') return userId;
  return userId.id || userId._id || null;
}
