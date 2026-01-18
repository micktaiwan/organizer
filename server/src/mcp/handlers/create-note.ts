import { Server } from 'socket.io';
import { Note, Label } from '../../models/index.js';
import { IMcpToken } from '../../models/McpToken.js';
import { IUser } from '../../models/User.js';
import { McpToolDefinition, McpToolResult } from '../types.js';

export const createNoteDefinition: McpToolDefinition = {
  name: 'create_note',
  description: 'Create a new note or checklist. Returns the created note with all populated fields.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['note', 'checklist'],
        description: 'Type of note to create. Default: "note"',
      },
      title: {
        type: 'string',
        description: 'Note title. Max 200 characters. Default: empty',
      },
      content: {
        type: 'string',
        description: 'Note content. Max 10000 characters. Default: empty',
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
        description: 'Checklist items (only for type="checklist"). Each item needs a "text" field.',
      },
      color: {
        type: 'string',
        description: 'Hex color code (e.g., "#FF5733"). Default: "#1a1a1a"',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of label IDs to attach to the note.',
      },
    },
  },
};

export async function createNoteHandler(
  args: Record<string, unknown>,
  _token: IMcpToken,
  user: IUser,
  io?: Server
): Promise<McpToolResult> {
  try {
    const type = (args.type as string) || 'note';
    const title = (args.title as string) || '';
    const content = (args.content as string) || '';
    const rawItems = (args.items as Array<{ text: string }>) || [];
    const color = (args.color as string) || '#1a1a1a';
    const labels = (args.labels as string[]) || [];

    if (!['note', 'checklist'].includes(type)) {
      return {
        content: [{ type: 'text', text: 'type must be "note" or "checklist"' }],
        isError: true,
      };
    }

    if (title.length > 200) {
      return {
        content: [{ type: 'text', text: 'title must be 200 characters or less' }],
        isError: true,
      };
    }

    if (content.length > 10000) {
      return {
        content: [{ type: 'text', text: 'content must be 10000 characters or less' }],
        isError: true,
      };
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return {
        content: [{ type: 'text', text: 'color must be a valid hex color (e.g., "#FF5733")' }],
        isError: true,
      };
    }

    if (labels.length > 0) {
      const labelCount = await Label.countDocuments({ _id: { $in: labels } });
      if (labelCount !== labels.length) {
        return {
          content: [{ type: 'text', text: 'One or more label IDs are invalid' }],
          isError: true,
        };
      }
    }

    const items = rawItems.map((item, index) => ({
      text: item.text,
      checked: false,
      order: index,
    }));

    const note = new Note({
      type,
      title,
      content,
      items,
      color,
      labels,
      assignedTo: user._id,
      createdBy: user._id,
    });

    await note.save();
    await note.populate([
      { path: 'labels', select: 'name color' },
      { path: 'assignedTo', select: 'username displayName' },
      { path: 'createdBy', select: 'username displayName' },
    ]);

    if (io) {
      io.to('notes').emit('note:created', { note, createdBy: user._id.toString() });
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
      createdBy: {
        username: (note.createdBy as any).username,
        displayName: (note.createdBy as any).displayName,
      },
      createdAt: note.createdAt.toISOString(),
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, note: noteData }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error creating note: ${error}` }],
      isError: true,
    };
  }
}
