import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILocationHistory extends Document {
  userId: Types.ObjectId;
  lat: number;
  lng: number;
  accuracy: number | null;
  street: string | null;
  city: string | null;
  country: string | null;
  createdAt: Date;
}

const LocationHistorySchema = new Schema<ILocationHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
    accuracy: {
      type: Number,
      default: null,
    },
    street: {
      type: String,
      default: null,
    },
    city: {
      type: String,
      default: null,
    },
    country: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Index composé pour requêtes efficaces: positions d'un user triées par date
LocationHistorySchema.index({ userId: 1, createdAt: -1 });

export const LocationHistory = mongoose.model<ILocationHistory>('LocationHistory', LocationHistorySchema);
