import { Room, Message } from '../../models/index.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const listMessagesDefinition: McpToolDefinition = {
  name: 'list_messages',
  description: 'Read messages from a chat room. Returns messages in chronological order.',
  inputSchema: {
    type: 'object',
    properties: {
      roomId: {
        type: 'string',
        description: 'The ID of the room to read messages from. Required.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of messages to return. Default: 50, Max: 100',
      },
      before: {
        type: 'string',
        description: 'ISO timestamp - only return messages before this time (for pagination)',
      },
    },
    required: ['roomId'],
  },
};

export async function listMessagesHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  user: IUser
): Promise<McpToolResult> {
  try {
    const roomId = args.roomId as string;
    const limit = Math.min(Number(args.limit) || 50, 100);
    const before = args.before as string | undefined;

    if (!roomId) {
      return {
        content: [{ type: 'text', text: 'roomId is required' }],
        isError: true,
      };
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return {
        content: [{ type: 'text', text: 'Room not found' }],
        isError: true,
      };
    }

    const isMember = room.members.some(m => m.userId.toString() === user._id.toString());
    const isPublic = room.type === 'public' || room.type === 'lobby';

    if (!isMember && !isPublic) {
      return {
        content: [{ type: 'text', text: 'Access denied to this room' }],
        isError: true,
      };
    }

    const query: Record<string, unknown> = { roomId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'username displayName');

    const messageList = messages.reverse().map(msg => ({
      id: msg._id.toString(),
      sender: {
        username: (msg.senderId as any)?.username || 'unknown',
        displayName: (msg.senderId as any)?.displayName || 'Unknown',
      },
      type: msg.type,
      content: msg.type === 'text' ? msg.content : `[${msg.type}]`,
      createdAt: msg.createdAt.toISOString(),
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          roomName: room.name,
          messages: messageList,
          count: messageList.length,
          hasMore: messages.length === limit,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error listing messages: ${error}` }],
      isError: true,
    };
  }
}
