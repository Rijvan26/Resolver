import { Schema, model, Document, Types } from "mongoose";
import { ServiceTier, SERVICE_TIERS } from "../types";

export interface IService extends Document {
  _id: Types.ObjectId;
  name: string;
  tier: ServiceTier;
  owningTeam: string;
  runbookLinks: string[];
  organizationId: Types.ObjectId;
  seeded?: boolean;
  benchSession?: string;
  createdAt: Date;
  updatedAt: Date;
}

const serviceSchema = new Schema<IService>(
  {
    name: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
      minlength: [2, "Service name must be at least 2 characters"],
      maxlength: [100, "Service name cannot exceed 100 characters"],
    },
    tier: {
      type: Number,
      enum: {
        values: SERVICE_TIERS,
        message: "Service tier must be 1, 2, or 3",
      },
      required: [true, "Service tier is required"],
      default: 2,
      index: true,
    },
    owningTeam: {
      type: String,
      required: [true, "Owning team is required"],
      trim: true,
      minlength: [2, "Owning team must be at least 2 characters"],
      maxlength: [100, "Owning team cannot exceed 100 characters"],
    },
    runbookLinks: {
      type: [String],
      default: [],
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
      index: true,
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

// Compound indexes for organizational isolation and lookup
serviceSchema.index({ organizationId: 1, name: 1 }, { unique: true });
serviceSchema.index({ organizationId: 1, tier: 1 });

export const Service = model<IService>("Service", serviceSchema);
export default Service;

