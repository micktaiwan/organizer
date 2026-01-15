import { Note } from '../../models/index.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const listNotesDefinition: McpToolDefinition = {
  name: 'list_notes',
  description: 'List all notes with title, type, author, and creation date.',
  inputSchema: {
    type: 'object',
    properties: {
      archived: {
        type: 'boolean',
        description: 'If true, return archived notes. If false, return active notes. Default: false',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of notes to return. Default: 50, Max: 100',
      },
    },
  },
};

export async function listNotesHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser
): Promise<McpToolResult> {
  try {
    const archived = args.archived === true;
    const limit = Math.min(Number(args.limit) || 50, 100);

    const notes = await Note.find({ isArchived: archived })
      .populate('createdBy', 'username displayName')
      .sort({ isPinned: -1, order: 1 })
      .limit(limit);

    const noteList = notes.map(note => ({
      id: note._id.toString(),
      title: note.title,
      type: note.type,
      createdBy: {
        username: (note.createdBy as any)?.username || 'unknown',
        displayName: (note.createdBy as any)?.displayName || 'Unknown',
      },
      createdAt: note.createdAt.toISOString(),
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ notes: noteList, count: noteList.length }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error listing notes: ${error}` }],
      isError: true,
    };
  }
}
