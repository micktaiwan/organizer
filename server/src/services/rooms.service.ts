import { Room } from '../models/index.js';
import { Types } from 'mongoose';

// ============================================================================
// Types
// ============================================================================

export interface ListRoomsOptions {
  userId: Types.ObjectId;
  type?: 'all' | 'private' | 'public' | 'lobby';
  limit?: number;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * List rooms accessible by a user
 * Includes rooms where user is member + public/lobby rooms
 */
export async function listRooms(options: ListRoomsOptions) {
  const { userId, type = 'all', limit = 50 } = options;

  const query: Record<string, unknown> = {
    $or: [
      { 'members.userId': userId },
      { type: 'public' },
      { type: 'lobby' },
    ],
  };

  if (type !== 'all') {
    query.type = type;
  }

  return Room.find(query)
    .populate('members.userId', 'username displayName isOnline')
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(limit);
}

/**
 * Get a room by ID
 */
export async function getRoomById(roomId: string) {
  return Room.findById(roomId);
}

/**
 * Check if user has access to a room
 */
export async function userHasAccessToRoom(
  roomId: string,
  userId: Types.ObjectId
): Promise<{ hasAccess: boolean; room: any | null; reason?: string }> {
  const room = await Room.findById(roomId);

  if (!room) {
    return { hasAccess: false, room: null, reason: 'Room not found' };
  }

  const isMember = room.members.some(m => m.userId.toString() === userId.toString());
  const isPublic = room.type === 'public' || room.type === 'lobby';

  if (!isMember && !isPublic) {
    return { hasAccess: false, room, reason: 'Access denied to this room' };
  }

  return { hasAccess: true, room };
}

/**
 * Add user to room members if not already a member
 */
export async function ensureUserInRoom(roomId: string, userId: Types.ObjectId) {
  const room = await Room.findById(roomId);
  if (!room) return null;

  const isMember = room.members.some(m => m.userId.toString() === userId.toString());
  if (!isMember) {
    room.members.push({
      userId: userId as any,
      joinedAt: new Date(),
      lastReadAt: null,
    });
    await room.save();
  }
  return room;
}

/**
 * Update room's last message timestamp
 */
export async function updateRoomLastMessage(roomId: string) {
  return Room.findByIdAndUpdate(roomId, { lastMessageAt: new Date() });
}
