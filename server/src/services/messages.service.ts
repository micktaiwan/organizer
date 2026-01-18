import { Message, Room, User } from '../models/index.js';
import { Types } from 'mongoose';

// ============================================================================
// Types
// ============================================================================

export interface ListMessagesOptions {
  roomId: string;
  limit?: number;
  before?: string;
}

export interface SendMessageOptions {
  roomId: string;
  senderId: Types.ObjectId;
  content: string;
  clientSource?: string;
}

export interface UnreadCount {
  roomId: string;
  roomName: string;
  roomType: string;
  unreadCount: number;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * List messages from a room
 * Returns messages in reverse chronological order (newest first from DB)
 */
export async function listMessages(options: ListMessagesOptions) {
  const { roomId, limit = 50, before } = options;

  const query: Record<string, unknown> = { roomId };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  return Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('senderId', 'username displayName');
}

/**
 * Create and save a new message
 */
export async function createMessage(options: SendMessageOptions) {
  const { roomId, senderId, content, clientSource = 'api' } = options;

  const message = new Message({
    roomId,
    senderId,
    type: 'text',
    content: content.trim(),
    status: 'sent',
    readBy: [],
    clientSource,
  });

  await message.save();
  await message.populate('senderId', 'username displayName status statusMessage');

  return message;
}

/**
 * Get the bot user
 */
export async function getBotUser() {
  return User.findOne({ isBot: true });
}

/**
 * Get unread message counts for a user across all their rooms
 */
export async function getUnreadCounts(userId: Types.ObjectId): Promise<{
  totalUnread: number;
  rooms: UnreadCount[];
}> {
  const rooms = await Room.find({ 'members.userId': userId });

  const unreadCounts = await Message.aggregate([
    {
      $match: {
        roomId: { $in: rooms.map(r => r._id) },
        senderId: { $ne: new Types.ObjectId(userId.toString()) },
        readBy: { $ne: new Types.ObjectId(userId.toString()) },
      },
    },
    {
      $group: {
        _id: '$roomId',
        count: { $sum: 1 },
      },
    },
  ]);

  const unreadMap = new Map(
    unreadCounts.map(item => [item._id.toString(), item.count])
  );

  const roomsWithUnread = rooms
    .map(room => ({
      roomId: room._id.toString(),
      roomName: room.name,
      roomType: room.type,
      unreadCount: unreadMap.get(room._id.toString()) || 0,
    }))
    .filter(r => r.unreadCount > 0)
    .sort((a, b) => b.unreadCount - a.unreadCount);

  const totalUnread = roomsWithUnread.reduce((sum, r) => sum + r.unreadCount, 0);

  return { totalUnread, rooms: roomsWithUnread };
}
