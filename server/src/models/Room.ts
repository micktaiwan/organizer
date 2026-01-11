import mongoose, { Schema, Document, Types } from 'mongoose';

export type RoomType = 'lobby' | 'public' | 'private';

export interface IRoomMember {
  userId: Types.ObjectId;
  joinedAt: Date;
  lastReadAt: Date | null;
}

export interface IRoom extends Document {
  name: string;
  type: RoomType;
  members: IRoomMember[];
  createdBy: Types.ObjectId;
  isLobby: boolean;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const RoomMemberSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  lastReadAt: {
    type: Date,
    default: null,
  },
});

const RoomSchema = new Schema<IRoom>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    type: {
      type: String,
      enum: ['lobby', 'public', 'private'],
      default: 'private',
    },
    members: [RoomMemberSchema],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isLobby: {
      type: Boolean,
      default: false,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

RoomSchema.index({ type: 1, isLobby: 1 });
RoomSchema.index({ 'members.userId': 1 });
RoomSchema.index({ createdBy: 1 });
RoomSchema.index({ lastMessageAt: -1 });

RoomSchema.index({ isLobby: 1 }, { unique: true, partialFilterExpression: { isLobby: true } });

export const Room = mongoose.model<IRoom>('Room', RoomSchema);
