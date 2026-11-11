import { Schema, model, Document, Types } from "mongoose";

export interface IRunbook extends Document {
  _id: Types.ObjectId;
  title: string;
  url: string;
  tags: string[];
  serviceId?: Types.ObjectId | null;
  organizationId: Types.ObjectId;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const runbookSchema = new Schema<IRunbook>(
  {
    title: {
      type: String,
      required: [true, "Runbook title is required"],
      trim: true,
      minlength: [2, "Runbook title must be at least 2 characters"],
      maxlength: [200, "Runbook title cannot exceed 200 characters"],
    },
    url: {
      type: String,
      required: [true, "Runbook URL is required"],
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      default: null,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

runbookSchema.index({ organizationId: 1, serviceId: 1 });
runbookSchema.index({ organizationId: 1, title: 1 });

export const Runbook = model<IRunbook>("Runbook", runbookSchema);
export default Runbook;

