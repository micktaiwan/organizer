import mongoose, { Schema, HydratedDocument } from 'mongoose';

export interface IReflectionStats {
  _id: string; // Always 'global'
  totalReflections: number;
  passCount: number;
  messageCount: number;
  rateLimitedCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastMessageAt: Date | null;
}

const ReflectionStatsSchema = new Schema<IReflectionStats>(
  {
    _id: {
      type: String,
      default: 'global',
    },
    totalReflections: {
      type: Number,
      default: 0,
    },
    passCount: {
      type: Number,
      default: 0,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    rateLimitedCount: {
      type: Number,
      default: 0,
    },
    totalInputTokens: {
      type: Number,
      default: 0,
    },
    totalOutputTokens: {
      type: Number,
      default: 0,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    _id: false, // We manage _id ourselves
  }
);

export const ReflectionStats = mongoose.model<IReflectionStats>('ReflectionStats', ReflectionStatsSchema);

/**
 * Get or create the global stats document
 */
export async function getOrCreateStats(): Promise<HydratedDocument<IReflectionStats>> {
  let stats = await ReflectionStats.findById('global');
  if (!stats) {
    stats = await ReflectionStats.create({
      _id: 'global',
      totalReflections: 0,
      passCount: 0,
      messageCount: 0,
      rateLimitedCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      lastMessageAt: null,
    });
  }
  return stats;
}
