import mongoose, { Schema, Document, Types } from 'mongoose';

export type NoteType = 'note' | 'checklist';

export interface IChecklistItem {
  _id: Types.ObjectId;
  text: string;
  checked: boolean;
  order: number;
}

export interface INote extends Document {
  type: NoteType;
  title: string;
  content: string;
  items: IChecklistItem[];
  color: string;
  labels: Types.ObjectId[];
  assignedTo: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  order: number;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChecklistItemSchema = new Schema<IChecklistItem>(
  {
    text: {
      type: String,
      required: true,
    },
    checked: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      required: true,
    },
  },
  { _id: true }
);

const NoteSchema = new Schema<INote>(
  {
    type: {
      type: String,
      enum: ['note', 'checklist'],
      default: 'note',
    },
    title: {
      type: String,
      default: '',
      maxlength: 200,
    },
    content: {
      type: String,
      default: '',
      maxlength: 10000,
    },
    items: [ChecklistItemSchema],
    color: {
      type: String,
      default: '#1a1a1a',
      match: /^#[0-9A-Fa-f]{6}$/,
    },
    labels: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Label',
      },
    ],
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    order: {
      type: Number,
      default: () => Date.now(),
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

NoteSchema.index({ order: 1 });
NoteSchema.index({ labels: 1 });
NoteSchema.index({ assignedTo: 1 });
NoteSchema.index({ createdBy: 1 });
NoteSchema.index({ isArchived: 1, isPinned: -1, order: 1 });

export const Note = mongoose.model<INote>('Note', NoteSchema);
