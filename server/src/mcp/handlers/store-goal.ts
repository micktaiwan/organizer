import { storeGoal } from '../../memory/self.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

const VALID_CATEGORIES = ['capability_request', 'understanding', 'connection', 'curiosity'] as const;
type GoalCategory = (typeof VALID_CATEGORIES)[number];

export const storeGoalDefinition: McpToolDefinition = {
  name: 'store_goal',
  description: 'Store a goal or aspiration. Deduplicates similar entries.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The goal or aspiration to store',
      },
      category: {
        type: 'string',
        enum: VALID_CATEGORIES,
        description: 'Category: capability_request (want to be able to do X), understanding (want to understand X), connection (want to connect with X), curiosity (curious about X)',
      },
    },
    required: ['content', 'category'],
  },
};

export async function storeGoalHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser
): Promise<McpToolResult> {
  try {
    const content = args.content as string;
    const category = args.category as GoalCategory;

    if (!content || content.trim().length === 0) {
      return {
        content: [{ type: 'text', text: 'content is required' }],
        isError: true,
      };
    }

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return {
        content: [{ type: 'text', text: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }],
        isError: true,
      };
    }

    await storeGoal({ content, category });

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, stored: content.slice(0, 100) }) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error storing goal: ${error}` }],
      isError: true,
    };
  }
}
