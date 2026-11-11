import { Schema, model, Document, Types } from "mongoose";
import { OrganizationAiSettings } from "../types";

export interface IOrganization extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  statusPageEnabled: boolean;
  aiSettings?: OrganizationAiSettings;
  seeded?: boolean;
  benchSession?: string;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      trim: true,
      minlength: [2, "Organization name must be at least 2 characters"],
      maxlength: [100, "Organization name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      required: [true, "Organization slug is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must consist of lowercase alphanumeric characters and single hyphens",
      ],
      maxlength: [120, "Organization slug cannot exceed 120 characters"],
    },
    statusPageEnabled: {
      type: Boolean,
      default: false,
    },
    aiSettings: {
      alertGrouping: { type: Boolean, default: true },
      runbooks: { type: Boolean, default: true },
      assistant: { type: Boolean, default: true },
      alertGroupingWindowMinutes: { type: Number, default: 30 },
      alertGroupingSimilarityThreshold: { type: Number, default: 0.82 },
    },
    seeded: {
      type: Boolean,
      default: false,
      index: true,
    },
    benchSession: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Unique index is defined on slug field above
export const Organization = model<IOrganization>("Organization", organizationSchema);
export default Organization;
