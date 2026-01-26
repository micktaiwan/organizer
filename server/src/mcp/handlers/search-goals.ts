import { searchGoals } from '../../memory/self.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const searchGoalsDefinition: McpToolDefinition = {
  name: 'search_goals',
  description: 'Search goals and aspirations. Categories: capability_request, understanding, connection, curiosity.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for goals',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10, max: 50)',
      },
    },
    required: ['query'],
  },
};

export async function searchGoalsHandler(
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

    const results = await searchGoals(query, limit);

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: 'No goals found for this query.' }],
      };
    }

    const formatted = results.map((r) => ({
      id: r.id,
      score: r.score.toFixed(3),
      content: r.payload.content,
      category: r.payload.goalCategory,
      timestamp: r.payload.timestamp,
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error searching goals: ${error}` }],
      isError: true,
    };
  }
}
