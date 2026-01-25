import mongoose, { Schema, Document } from 'mongoose';

export type ReflectionAction = 'pass' | 'message';
export type ReflectionTone = 'playful' | 'helpful' | 'technical';

export interface IReflection extends Document {
  timestamp: Date;
  activitySummary: string;
  goalsCount: number;
  factsCount: number;
  action: ReflectionAction;
  message?: string;
  reason: string;
  tone?: ReflectionTone;
  goalId?: string;
  roomId?: string;
  roomName?: string;
  rateLimited: boolean;
  dryRun: boolean;
  llmModel: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const ReflectionSchema = new Schema<IReflection>(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    activitySummary: {
      type: String,
      required: true,
    },
    goalsCount: {
      type: Number,
      required: true,
      default: 0,
    },
    factsCount: {
      type: Number,
      required: true,
      default: 0,
    },
    action: {
      type: String,
      enum: ['pass', 'message'],
      required: true,
    },
    message: {
      type: String,
      required: false,
    },
    reason: {
      type: String,
      required: true,
    },
    tone: {
      type: String,
      enum: ['playful', 'helpful', 'technical'],
      required: false,
    },
    goalId: {
      type: String,
      required: false,
    },
    roomId: {
      type: String,
      required: false,
    },
    roomName: {
      type: String,
      required: false,
    },
    rateLimited: {
      type: Boolean,
      required: true,
      default: false,
    },
    dryRun: {
      type: Boolean,
      required: true,
      default: false,
    },
    llmModel: {
      type: String,
      required: true,
      default: 'unknown',
    },
    inputTokens: {
      type: Number,
      required: true,
      default: 0,
    },
    outputTokens: {
      type: Number,
      required: true,
      default: 0,
    },
    durationMs: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying recent reflections
ReflectionSchema.index({ createdAt: -1 });

export const Reflection = mongoose.model<IReflection>('Reflection', ReflectionSchema);
