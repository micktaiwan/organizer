import mongoose, { Schema, Document, Types } from 'mongoose';

export type MessageType = 'text' | 'image' | 'audio' | 'system' | 'file';
export type MessageStatus = 'sent' | 'delivered' | 'read';
export type ClientSource = 'desktop' | 'android' | 'api';
export type ReactionEmoji = '👍' | '❤️' | '😂' | '😮' | '😢' | '😡' | '✅' | '⚠️' | '🙏' | '🎉' | '👋' | '😘';

export const ALLOWED_EMOJIS: ReactionEmoji[] = ['👍', '❤️', '😂', '😮', '😢', '😡', '✅', '⚠️', '🙏', '🎉', '👋', '😘'];

export interface IReaction {
  userId: Types.ObjectId;
  emoji: ReactionEmoji;
  createdAt: Date;
}

export interface IMessage extends Document {
  roomId: Types.ObjectId;
  senderId: Types.ObjectId;
  type: MessageType;
  content: string;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  fileDeleted?: boolean;
  status: MessageStatus;
  readBy: Types.ObjectId[];
  reactions: IReaction[];
  clientSource?: ClientSource;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'audio', 'system', 'file'],
      default: 'text',
    },
    content: {
      type: String,
      required: true,
    },
    caption: {
      type: String,
      required: false,
    },
    fileName: {
      type: String,
      required: false,
    },
    fileSize: {
      type: Number,
      required: false,
    },
    mimeType: {
      type: String,
      required: false,
    },
    fileDeleted: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    readBy: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    reactions: [{
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      emoji: {
        type: String,
        required: true,
        enum: ALLOWED_EMOJIS,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    }],
    clientSource: {
      type: String,
      enum: ['desktop', 'android', 'api'],
    },
  },
  {
    timestamps: true,
  }
);

MessageSchema.index({ roomId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
