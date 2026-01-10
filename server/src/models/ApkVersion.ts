import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IApkVersion extends Document {
  version: string;
  versionCode: number;
  filename: string;
  fileSize: number;
  checksum: string;
  releaseNotes: string;
  isLatest: boolean;
  downloadCount: number;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ApkVersionSchema = new Schema<IApkVersion>(
  {
    version: {
      type: String,
      required: true,
      unique: true,
    },
    versionCode: {
      type: Number,
      required: true,
      unique: true,
    },
    filename: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    checksum: {
      type: String,
      required: true,
    },
    releaseNotes: {
      type: String,
      default: '',
    },
    isLatest: {
      type: Boolean,
      default: false,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

ApkVersionSchema.index({ isLatest: 1 });
ApkVersionSchema.index({ versionCode: -1 });

export const ApkVersion = mongoose.model<IApkVersion>('ApkVersion', ApkVersionSchema);
