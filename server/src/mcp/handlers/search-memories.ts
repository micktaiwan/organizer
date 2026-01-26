import { searchFacts } from '../../memory/qdrant.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const searchMemoriesDefinition: McpToolDefinition = {
  name: 'search_memories',
  description: 'Search facts/memories by semantic similarity. Returns relevant facts about users, events, or learned information.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to find relevant memories',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10, max: 50)',
      },
    },
    required: ['query'],
  },
};

export async function searchMemoriesHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser
): Promise<McpToolResult> {
  try {
    const query = args.query as string;
    const limit = Math.min((args.limit as number) || 10, 50);

    if (!query || query.trim().length === 0) {
      return {
        content: [{ type: 'text', text: 'query is required' }],
        isError: true,
      };
    }

    const results = await searchFacts(query, limit);

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: 'No memories found for this query.' }],
      };
    }

    const formatted = results.map((r) => ({
      id: r.id,
      score: r.score.toFixed(3),
      content: r.payload.content,
      subjects: r.payload.subjects,
      timestamp: r.payload.timestamp,
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error searching memories: ${error}` }],
      isError: true,
    };
  }
}
