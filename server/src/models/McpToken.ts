import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMcpToken extends Document {
  token: string;
  tokenPrefix: string;
  name: string;
  userId: Types.ObjectId;
  scopes: string[];
  allowedTools: string[];
  rateLimit: number;
  isRevoked: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const McpTokenSchema = new Schema<IMcpToken>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tokenPrefix: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    scopes: {
      type: [String],
      enum: ['read', 'write'],
      default: ['read'],
    },
    allowedTools: {
      type: [String],
      default: ['*'],
    },
    rateLimit: {
      type: Number,
      default: 60,
      min: 1,
      max: 1000,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    lastUsedIp: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

McpTokenSchema.index({ token: 1, isRevoked: 1 });
McpTokenSchema.index({ userId: 1, isRevoked: 1 });

export const McpToken = mongoose.model<IMcpToken>('McpToken', McpTokenSchema);
