import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserLocation {
  lat: number;
  lng: number;
  street: string | null;
  city: string | null;
  country: string | null;
  updatedAt: Date;
}

export interface IAppVersion {
  versionName: string;
  versionCode: number;
  updatedAt: Date;
}

export interface IUser extends Document {
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  peerId?: string | null; // DEPRECATED: No longer used (WebRTC via Socket.io)
  isOnline: boolean;
  isAdmin: boolean;
  isBot: boolean;
  status: 'available' | 'busy' | 'away' | 'dnd';
  statusMessage: string | null;
  statusExpiresAt: Date | null;
  isMuted: boolean;
  lastSeen: Date;
  location?: IUserLocation | null;
  appVersion?: IAppVersion | null;
  lastClient?: 'desktop' | 'android' | null;
  // Tracking mode
  isTracking: boolean;
  trackingExpiresAt: Date | null;
  currentTrackId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    peerId: {
      type: String,
      default: null,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    isBot: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['available', 'busy', 'away', 'dnd'],
      default: 'available',
    },
    statusMessage: {
      type: String,
      default: null,
      maxlength: 100,
    },
    statusExpiresAt: {
      type: Date,
      default: null,
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    location: {
      type: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        street: { type: String, default: null },
        city: { type: String, default: null },
        country: { type: String, default: null },
        updatedAt: { type: Date, default: Date.now },
      },
      default: null,
    },
    appVersion: {
      type: {
        versionName: { type: String, required: true },
        versionCode: { type: Number, required: true },
        updatedAt: { type: Date, default: Date.now },
      },
      default: null,
    },
    lastClient: {
      type: String,
      enum: ['desktop', 'android'],
      default: null,
    },
    // Tracking mode
    isTracking: {
      type: Boolean,
      default: false,
    },
    trackingExpiresAt: {
      type: Date,
      default: null,
    },
    currentTrackId: {
      type: Schema.Types.ObjectId,
      ref: 'Track',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ username: 'text', displayName: 'text' });

export const User = mongoose.model<IUser>('User', UserSchema);
