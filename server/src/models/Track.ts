import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITrackPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: Date;
}

export interface ITrack extends Document {
  userId: Types.ObjectId;
  points: ITrackPoint[];
  startedAt: Date;
  endedAt: Date | null;
  isActive: boolean;
}

const TrackPointSchema = new Schema<ITrackPoint>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: { type: Number, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TrackSchema = new Schema<ITrack>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    points: {
      type: [TrackPointSchema],
      default: [],
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index pour trouver rapidement les tracks actifs d'un user
TrackSchema.index({ userId: 1, isActive: 1 });

export const Track = mongoose.model<ITrack>('Track', TrackSchema);
