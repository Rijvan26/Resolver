import { Schema, model, Document, Types } from "mongoose";
import { ACTIVITY_ACTION, ActivityAction } from "../types";

export interface IActivity extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  incidentId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: ActivityAction;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
      index: true,
    },
    incidentId: {
      type: Schema.Types.ObjectId,
      ref: "Incident",
      required: [true, "Incident reference is required"],
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Actor reference is required"],
      index: true,
    },
    action: {
      type: String,
      enum: {
        values: Object.values(ACTIVITY_ACTION),
        message: "Invalid activity action type",
      },
      required: [true, "Action type is required"],
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

activitySchema.index({ organizationId: 1, incidentId: 1, createdAt: -1 });
activitySchema.index({ organizationId: 1, incidentId: 1, createdAt: 1 });

export const Activity = model<IActivity>("Activity", activitySchema);
export default Activity;
