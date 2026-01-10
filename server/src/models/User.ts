import mongoose, { Schema, Document } from 'mongoose';

export interface IUserLocation {
  lat: number;
  lng: number;
  street: string | null;
  city: string | null;
  country: string | null;
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
  status: 'available' | 'busy' | 'away' | 'dnd';
  statusMessage: string | null;
  isMuted: boolean;
  lastSeen: Date;
  location?: IUserLocation | null;
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
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ username: 'text', displayName: 'text' });

export const User = mongoose.model<IUser>('User', UserSchema);
