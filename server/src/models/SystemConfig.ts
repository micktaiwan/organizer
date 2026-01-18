import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemConfig extends Document {
  key: string;
  value: unknown;
  updatedAt: Date;
}

const SystemConfigSchema = new Schema<ISystemConfig>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const SystemConfig = mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);

// Helper functions
export async function getConfig<T>(key: string): Promise<T | null> {
  const doc = await SystemConfig.findOne({ key });
  return doc ? (doc.value as T) : null;
}

export async function setConfig<T>(key: string, value: T): Promise<void> {
  await SystemConfig.updateOne({ key }, { key, value }, { upsert: true });
}
