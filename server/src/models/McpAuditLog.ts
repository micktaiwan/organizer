import mongoose, { Schema, Document, Types } from 'mongoose';

export type McpAuditAction =
  | 'list_rooms'
  | 'list_messages'
  | 'search_users'
  | 'get_unread'
  | 'send_message'
  | 'auth_failure'
  | 'rate_limited';

export interface IMcpAuditLog extends Document {
  tokenId: Types.ObjectId | null;
  userId: Types.ObjectId | null;
  action: McpAuditAction;
  method: string;
  params: Record<string, unknown>;
  result: 'success' | 'error';
  errorMessage: string | null;
  ip: string;
  userAgent: string | null;
  durationMs: number;
  createdAt: Date;
}

const McpAuditLogSchema = new Schema<IMcpAuditLog>(
  {
    tokenId: {
      type: Schema.Types.ObjectId,
      ref: 'McpToken',
      default: null,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    action: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      required: true,
    },
    params: {
      type: Schema.Types.Mixed,
      default: {},
    },
    result: {
      type: String,
      enum: ['success', 'error'],
      required: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    durationMs: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

McpAuditLogSchema.index({ tokenId: 1, createdAt: -1 });
McpAuditLogSchema.index({ userId: 1, createdAt: -1 });
McpAuditLogSchema.index({ action: 1, createdAt: -1 });
// TTL: auto-delete after 90 days
McpAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const McpAuditLog = mongoose.model<IMcpAuditLog>('McpAuditLog', McpAuditLogSchema);
