import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IContact extends Document {
  userId: Types.ObjectId;
  contactId: Types.ObjectId;
  nickname: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    nickname: {
      type: String,
      default: null,
      trim: true,
      maxlength: 50,
    },
  },
  {
    timestamps: true,
  }
);

ContactSchema.index({ userId: 1, contactId: 1 }, { unique: true });

export const Contact = mongoose.model<IContact>('Contact', ContactSchema);
