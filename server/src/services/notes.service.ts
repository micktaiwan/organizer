import { Note, Label, type INote, type IChecklistItem } from '../models/index.js';
import { Types } from 'mongoose';

// ============================================================================
// Types
// ============================================================================

export interface NoteSearchResult {
  _id: Types.ObjectId;
  title: string;
  content: string;
  type: string;
  items?: { text: string; checked: boolean }[];
  createdAt: Date;
}

export interface ListNotesOptions {
  archived?: boolean;
  labelId?: string;
  limit?: number;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Search notes by keyword (used by Worker Eko)
 * Searches in title, content, and checklist items
 */
export async function searchNotes(query: string, limit = 10): Promise<NoteSearchResult[]> {
  const regex = new RegExp(query, 'i');
  return Note.find({
    isArchived: false,
    $or: [
      { title: regex },
      { content: regex },
      { 'items.text': regex }
    ]
  })
    .select('title content type items createdAt')
    .limit(limit)
    .sort({ updatedAt: -1 })
    .lean() as Promise<NoteSearchResult[]>;
}

/**
 * Get a note by ID (raw, no population)
 */
export async function getNoteById(id: string) {
  return Note.findById(id).lean();
}

/**
 * Get a note by ID with populated fields (used by MCP)
 */
export async function getNoteByIdWithPopulate(id: string) {
  return Note.findById(id)
    .populate('labels', 'name color')
    .populate('assignedTo', 'username displayName')
    .populate('createdBy', 'username displayName');
}

/**
 * List notes with options (used by MCP)
 */
export async function listNotes(options: ListNotesOptions) {
  const filter: Record<string, unknown> = { isArchived: options.archived ?? false };
  if (options.labelId) {
    filter.labels = options.labelId;
  }

  return Note.find(filter)
    .populate('createdBy', 'username displayName')
    .sort({ isPinned: -1, order: 1 })
    .limit(options.limit ?? 100);
}

// ============================================================================
// Create / Update
// ============================================================================

export interface CreateNoteOptions {
  type: 'note' | 'checklist';
  title?: string;
  content?: string;
  items?: Array<{ text: string }>;
  color?: string;
  labels?: string[];
  userId: Types.ObjectId;
}

export interface UpdateNoteOptions {
  title?: string;
  content?: string;
  color?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  labels?: string[];
}

/**
 * Validate that all label IDs exist
 */
export async function validateLabels(labelIds: string[]): Promise<boolean> {
  if (labelIds.length === 0) return true;
  const count = await Label.countDocuments({ _id: { $in: labelIds } });
  return count === labelIds.length;
}

/**
 * Create a new note
 */
export async function createNote(options: CreateNoteOptions) {
  const {
    type,
    title = '',
    content = '',
    items = [],
    color = '#1a1a1a',
    labels = [],
    userId,
  } = options;

  const formattedItems = items.map((item, index) => ({
    text: item.text,
    checked: false,
    order: index,
  }));

  const note = new Note({
    type,
    title,
    content,
    items: formattedItems,
    color,
    labels,
    assignedTo: userId,
    createdBy: userId,
  });

  await note.save();
  await note.populate([
    { path: 'labels', select: 'name color' },
    { path: 'assignedTo', select: 'username displayName' },
    { path: 'createdBy', select: 'username displayName' },
  ]);

  return note;
}

/**
 * Update an existing note
 */
export async function updateNote(noteId: string, options: UpdateNoteOptions) {
  const note = await Note.findById(noteId);
  if (!note) return null;

  if (options.title !== undefined) note.title = options.title;
  if (options.content !== undefined) note.content = options.content;
  if (options.color !== undefined) note.color = options.color;
  if (options.isPinned !== undefined) note.isPinned = options.isPinned;
  if (options.isArchived !== undefined) note.isArchived = options.isArchived;
  if (options.labels !== undefined) note.labels = options.labels as any;

  await note.save();
  await note.populate([
    { path: 'labels', select: 'name color' },
    { path: 'assignedTo', select: 'username displayName' },
    { path: 'createdBy', select: 'username displayName' },
  ]);

  return note;
}
