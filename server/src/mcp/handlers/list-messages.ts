import { listMessages } from '../../services/messages.service.js';
import { userHasAccessToRoom } from '../../services/rooms.service.js';
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

    const { hasAccess, room, reason } = await userHasAccessToRoom(roomId, user._id);
    if (!hasAccess) {
      return {
        content: [{ type: 'text', text: reason || 'Access denied' }],
        isError: true,
      };
    }

    const messages = await listMessages({ roomId, limit, before });

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
