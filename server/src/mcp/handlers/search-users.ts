import { User } from '../../models/index.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const searchUsersDefinition: McpToolDefinition = {
  name: 'search_users',
  description: 'Search for users by username or display name.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (min 2 characters). Searches username and displayName.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of users to return. Default: 20, Max: 50',
      },
    },
    required: ['query'],
  },
};

export async function searchUsersHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser
): Promise<McpToolResult> {
  try {
    const query = args.query as string;
    const limit = Math.min(Number(args.limit) || 20, 50);

    if (!query || query.length < 2) {
      return {
        content: [{ type: 'text', text: 'Query must be at least 2 characters' }],
        isError: true,
      };
    }

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { displayName: { $regex: query, $options: 'i' } },
      ],
    })
      .select('username displayName isOnline isBot isAdmin lastSeen')
      .limit(limit);

    const userList = users.map(u => ({
      id: u._id.toString(),
      username: u.username,
      displayName: u.displayName,
      isOnline: u.isOnline,
      isBot: u.isBot,
      isAdmin: u.isAdmin,
      lastSeen: u.lastSeen?.toISOString() || null,
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ users: userList, count: userList.length }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error searching users: ${error}` }],
      isError: true,
    };
  }
}
