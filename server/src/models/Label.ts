import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILabel extends Document {
  name: string;
  color: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LabelSchema = new Schema<ILabel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    color: {
      type: String,
      default: '#808080',
      match: /^#[0-9A-Fa-f]{6}$/,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

LabelSchema.index({ name: 1 }, { unique: true });

export const Label = mongoose.model<ILabel>('Label', LabelSchema);
