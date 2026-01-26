import { storeSelf } from '../../memory/self.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

const VALID_CATEGORIES = ['context', 'capability', 'limitation', 'preference', 'relation'] as const;
type SelfCategory = (typeof VALID_CATEGORIES)[number];

export const storeSelfDefinition: McpToolDefinition = {
  name: 'store_self',
  description: 'Store self-knowledge (what Eko learns about himself). Deduplicates similar entries.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The self-knowledge to store',
      },
      category: {
        type: 'string',
        enum: VALID_CATEGORIES,
        description: 'Category: context (situation), capability (what I can do), limitation (what I cannot do), preference (what I like), relation (how I relate to others)',
      },
    },
    required: ['content', 'category'],
  },
};

export async function storeSelfHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser
): Promise<McpToolResult> {
  try {
    const content = args.content as string;
    const category = args.category as SelfCategory;

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

    await storeSelf({ content, category });

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, stored: content.slice(0, 100) }) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error storing self: ${error}` }],
      isError: true,
    };
  }
}
