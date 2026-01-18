import { Server } from 'socket.io';
import { updateNote, validateLabels } from '../../services/notes.service.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const updateNoteDefinition: McpToolDefinition = {
  name: 'update_note',
  description: 'Update an existing note. Only provided fields will be updated. Can update title, content, or both in a single call.',
  inputSchema: {
    type: 'object',
    properties: {
      noteId: {
        type: 'string',
        description: 'The ID of the note to update. Required.',
      },
      title: {
        type: 'string',
        description: 'New title. Max 200 characters.',
      },
      content: {
        type: 'string',
        description: 'New content. Max 10000 characters.',
      },
      color: {
        type: 'string',
        description: 'New hex color code (e.g., "#FF5733").',
      },
      isPinned: {
        type: 'boolean',
        description: 'Pin or unpin the note.',
      },
      isArchived: {
        type: 'boolean',
        description: 'Archive or unarchive the note.',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'New array of label IDs. Replaces existing labels.',
      },
    },
    required: ['noteId'],
  },
};

export async function updateNoteHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  user: IUser,
  io?: Server
): Promise<McpToolResult> {
  try {
    const noteId = args.noteId as string;

    if (!noteId) {
      return {
        content: [{ type: 'text', text: 'noteId is required' }],
        isError: true,
      };
    }

    // Validation
    if (args.title !== undefined && (args.title as string).length > 200) {
      return {
        content: [{ type: 'text', text: 'title must be 200 characters or less' }],
        isError: true,
      };
    }

    if (args.content !== undefined && (args.content as string).length > 10000) {
      return {
        content: [{ type: 'text', text: 'content must be 10000 characters or less' }],
        isError: true,
      };
    }

    if (args.color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(args.color as string)) {
      return {
        content: [{ type: 'text', text: 'color must be a valid hex color (e.g., "#FF5733")' }],
        isError: true,
      };
    }

    if (args.labels !== undefined) {
      const labels = args.labels as string[];
      if (labels.length > 0 && !(await validateLabels(labels))) {
        return {
          content: [{ type: 'text', text: 'One or more label IDs are invalid' }],
          isError: true,
        };
      }
    }

    const note = await updateNote(noteId, {
      title: args.title as string | undefined,
      content: args.content as string | undefined,
      color: args.color as string | undefined,
      isPinned: args.isPinned as boolean | undefined,
      isArchived: args.isArchived as boolean | undefined,
      labels: args.labels as string[] | undefined,
    });

    if (!note) {
      return {
        content: [{ type: 'text', text: 'Note not found' }],
        isError: true,
      };
    }

    if (io) {
      io.to('notes').emit('note:updated', { note, updatedBy: user._id.toString() });
    }

    const noteData = {
      id: note._id.toString(),
      type: note.type,
      title: note.title,
      content: note.content,
      color: note.color,
      isPinned: note.isPinned,
      isArchived: note.isArchived,
      labels: note.labels.map((l: any) => ({
        id: l._id.toString(),
        name: l.name,
        color: l.color,
      })),
      updatedAt: note.updatedAt.toISOString(),
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, note: noteData }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error updating note: ${error}` }],
      isError: true,
    };
  }
}
