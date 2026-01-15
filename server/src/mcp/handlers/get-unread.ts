import { Types } from 'mongoose';
import { Room, Message } from '../../models/index.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const getUnreadDefinition: McpToolDefinition = {
  name: 'get_unread',
  description: 'Get unread message counts for all rooms the user is a member of.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function getUnreadHandler(
  _args: Record<string, unknown>,
  _token: IMcpToken,
  user: IUser
): Promise<McpToolResult> {
  try {
    const rooms = await Room.find({ 'members.userId': user._id });

    const unreadCounts = await Message.aggregate([
      {
        $match: {
          roomId: { $in: rooms.map(r => r._id) },
          senderId: { $ne: new Types.ObjectId(user._id.toString()) },
          readBy: { $ne: new Types.ObjectId(user._id.toString()) },
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

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalUnread,
          rooms: roomsWithUnread,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error getting unread counts: ${error}` }],
      isError: true,
    };
  }
}
