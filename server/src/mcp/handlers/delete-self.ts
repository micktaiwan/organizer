import { deleteSelf } from '../../memory/self.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const deleteSelfDefinition: McpToolDefinition = {
  name: 'delete_self',
  description: 'Delete a self-knowledge entry by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The UUID of the self-knowledge to delete',
      },
    },
    required: ['id'],
  },
};

export async function deleteSelfHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser
): Promise<McpToolResult> {
  try {
    const id = args.id as string;

    if (!id || id.trim().length === 0) {
      return {
        content: [{ type: 'text', text: 'id is required' }],
        isError: true,
      };
    }

    await deleteSelf(id);

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: id }) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error deleting self: ${error}` }],
      isError: true,
    };
  }
}
