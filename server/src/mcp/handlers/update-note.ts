import { Server } from 'socket.io';
import { Note, Label } from '../../models/index.js';
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

    const note = await Note.findById(noteId);
    if (!note) {
      return {
        content: [{ type: 'text', text: 'Note not found' }],
        isError: true,
      };
    }

    if (args.title !== undefined) {
      const title = args.title as string;
      if (title.length > 200) {
        return {
          content: [{ type: 'text', text: 'title must be 200 characters or less' }],
          isError: true,
        };
      }
      note.title = title;
    }

    if (args.content !== undefined) {
      const content = args.content as string;
      if (content.length > 10000) {
        return {
          content: [{ type: 'text', text: 'content must be 10000 characters or less' }],
          isError: true,
        };
      }
      note.content = content;
    }

    if (args.color !== undefined) {
      const color = args.color as string;
      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return {
          content: [{ type: 'text', text: 'color must be a valid hex color (e.g., "#FF5733")' }],
          isError: true,
        };
      }
      note.color = color;
    }

    if (args.isPinned !== undefined) {
      note.isPinned = args.isPinned as boolean;
    }

    if (args.isArchived !== undefined) {
      note.isArchived = args.isArchived as boolean;
    }

    if (args.labels !== undefined) {
      const labels = args.labels as string[];
      if (labels.length > 0) {
        const labelCount = await Label.countDocuments({ _id: { $in: labels } });
        if (labelCount !== labels.length) {
          return {
            content: [{ type: 'text', text: 'One or more label IDs are invalid' }],
            isError: true,
          };
        }
      }
      note.labels = labels as any;
    }

    await note.save();
    await note.populate([
      { path: 'labels', select: 'name color' },
      { path: 'assignedTo', select: 'username displayName' },
      { path: 'createdBy', select: 'username displayName' },
    ]);

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
