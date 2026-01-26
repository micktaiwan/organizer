import { deleteFact } from '../../memory/qdrant.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const deleteMemoryDefinition: McpToolDefinition = {
  name: 'delete_memory',
  description: 'Delete a memory/fact by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The UUID of the memory to delete',
      },
    },
    required: ['id'],
  },
};

export async function deleteMemoryHandler(
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

    await deleteFact(id);

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: id }) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error deleting memory: ${error}` }],
      isError: true,
    };
  }
}
