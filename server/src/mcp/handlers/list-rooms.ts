import { listRooms } from '../../services/rooms.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const listRoomsDefinition: McpToolDefinition = {
  name: 'list_rooms',
  description: 'List all chat rooms the user has access to, including room type, member count, and last activity.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['all', 'private', 'public', 'lobby'],
        description: 'Filter by room type. Default: all',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of rooms to return. Default: 50, Max: 100',
      },
    },
  },
};

export async function listRoomsHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  user: IUser
): Promise<McpToolResult> {
  try {
    const type = (args.type as 'all' | 'private' | 'public' | 'lobby') || 'all';
    const limit = Math.min(Number(args.limit) || 50, 100);

    const rooms = await listRooms({
      userId: user._id,
      type,
      limit,
    });

    const roomList = rooms.map(room => ({
      id: room._id.toString(),
      name: room.name,
      type: room.type,
      memberCount: room.members.length,
      isLobby: room.isLobby,
      lastMessageAt: room.lastMessageAt?.toISOString() || null,
      members: room.members.slice(0, 10).map(m => ({
        username: (m.userId as any)?.username || 'unknown',
        displayName: (m.userId as any)?.displayName || 'Unknown',
        isOnline: (m.userId as any)?.isOnline || false,
      })),
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ rooms: roomList, count: roomList.length }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error listing rooms: ${error}` }],
      isError: true,
    };
  }
}
