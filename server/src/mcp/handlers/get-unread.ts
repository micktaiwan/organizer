import { getUnreadCounts } from '../../services/messages.service.js';
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
    const { totalUnread, rooms } = await getUnreadCounts(user._id);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ totalUnread, rooms }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error getting unread counts: ${error}` }],
      isError: true,
    };
  }
}
