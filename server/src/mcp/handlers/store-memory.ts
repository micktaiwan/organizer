import { storeFactMemory } from '../../memory/qdrant.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const storeMemoryDefinition: McpToolDefinition = {
  name: 'store_memory',
  description: 'Store a new fact or memory. Facts are deduplicated: if a very similar fact exists, it will be updated.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The fact or memory to store',
      },
      subjects: {
        type: 'array',
        items: { type: 'string' },
        description: 'People or topics this fact relates to (e.g., ["Mickael", "coding"])',
      },
      ttl: {
        type: 'string',
        description: 'Time to live: "7d", "1h", "30m", or null for permanent. Default: null',
      },
    },
    required: ['content', 'subjects'],
  },
};

export async function storeMemoryHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser
): Promise<McpToolResult> {
  try {
    const content = args.content as string;
    const subjects = args.subjects as string[];
    const ttl = (args.ttl as string) || null;

    if (!content || content.trim().length === 0) {
      return {
        content: [{ type: 'text', text: 'content is required' }],
        isError: true,
      };
    }

    if (!subjects || subjects.length === 0) {
      return {
        content: [{ type: 'text', text: 'subjects array is required (at least one subject)' }],
        isError: true,
      };
    }

    if (ttl && !/^(\d+[dhm])$/.test(ttl)) {
      return {
        content: [{ type: 'text', text: 'ttl must be in format: "7d", "1h", "30m", or null' }],
        isError: true,
      };
    }

    await storeFactMemory({ content, subjects, ttl });

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, stored: content.slice(0, 100) }) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error storing memory: ${error}` }],
      isError: true,
    };
  }
}
