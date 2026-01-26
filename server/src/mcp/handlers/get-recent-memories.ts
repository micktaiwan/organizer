import { listFacts } from '../../memory/qdrant.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const getRecentMemoriesDefinition: McpToolDefinition = {
  name: 'get_recent_memories',
  description: 'Get the most recent facts/memories, sorted by timestamp. Useful to see what was recently learned.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 20, max: 50)',
      },
    },
  },
};

export async function getRecentMemoriesHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser
): Promise<McpToolResult> {
  try {
    const limit = Math.min((args.limit as number) || 20, 50);

    const results = await listFacts(limit);

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: 'No memories stored yet.' }],
      };
    }

    const formatted = results.map((r) => ({
      id: r.id,
      content: r.payload.content,
      subjects: r.payload.subjects,
      expiresAt: r.payload.expiresAt,
      timestamp: r.payload.timestamp,
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error getting recent memories: ${error}` }],
      isError: true,
    };
  }
}
