import { searchNotes } from '../../services/notes.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const searchNotesDefinition: McpToolDefinition = {
  name: 'search_notes',
  description: 'Search notes by keyword in title, content, or checklist items.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to find in notes',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10, max: 50)',
      },
    },
    required: ['query'],
  },
};

export async function searchNotesHandler(
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

    const notes = await searchNotes(query, limit);

    if (notes.length === 0) {
      return {
        content: [{ type: 'text', text: 'No notes found for this query.' }],
      };
    }

    const formatted = notes.map((n) => {
      let preview = n.content || '';
      if (n.type === 'checklist' && n.items?.length) {
        preview = n.items.map((i) => `${i.checked ? '✓' : '○'} ${i.text}`).join(', ');
      }
      preview = preview.slice(0, 100) + (preview.length > 100 ? '...' : '');

      return {
        id: n._id.toString(),
        title: n.title || 'Sans titre',
        type: n.type,
        preview,
        createdAt: n.createdAt.toISOString(),
      };
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error searching notes: ${error}` }],
      isError: true,
    };
  }
}
