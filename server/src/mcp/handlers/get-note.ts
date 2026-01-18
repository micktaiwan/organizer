import { getNoteByIdWithPopulate } from '../../services/notes.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const getNoteDefinition: McpToolDefinition = {
  name: 'get_note',
  description: 'Read a single note with all details including full content, checklist items, labels, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      noteId: {
        type: 'string',
        description: 'The ID of the note to retrieve. Required.',
      },
    },
    required: ['noteId'],
  },
};

export async function getNoteHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  _user: IUser
): Promise<McpToolResult> {
  try {
    const noteId = args.noteId as string;

    if (!noteId) {
      return {
        content: [{ type: 'text', text: 'noteId is required' }],
        isError: true,
      };
    }

    const note = await getNoteByIdWithPopulate(noteId);

    if (!note) {
      return {
        content: [{ type: 'text', text: 'Note not found' }],
        isError: true,
      };
    }

    const noteData: Record<string, unknown> = {
      id: note._id.toString(),
      type: note.type,
      title: note.title,
      content: note.content,
      color: note.color,
      isPinned: note.isPinned,
      isArchived: note.isArchived,
      order: note.order,
      labels: note.labels.map((l: any) => ({
        id: l._id.toString(),
        name: l.name,
        color: l.color,
      })),
      assignedTo: note.assignedTo ? {
        id: (note.assignedTo as any)._id.toString(),
        username: (note.assignedTo as any).username,
        displayName: (note.assignedTo as any).displayName,
      } : null,
      createdBy: {
        id: (note.createdBy as any)._id.toString(),
        username: (note.createdBy as any).username,
        displayName: (note.createdBy as any).displayName,
      },
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };

    if (note.type === 'checklist') {
      noteData.items = note.items.map(item => ({
        id: item._id.toString(),
        text: item.text,
        checked: item.checked,
        order: item.order,
      }));
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ note: noteData }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error getting note: ${error}` }],
      isError: true,
    };
  }
}
