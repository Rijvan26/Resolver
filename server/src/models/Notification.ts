import { Schema, model, Document, Types } from "mongoose";
import { NOTIFICATION_TYPES, NotificationType } from "../types";

export interface INotification extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  recipientId: Types.ObjectId;
  actorId?: Types.ObjectId | null;
  incidentId?: Types.ObjectId | null;
  type: NotificationType;
  title: string;
  message: string;
  readAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
      index: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient reference is required"],
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    incidentId: {
      type: Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: Object.values(NOTIFICATION_TYPES),
        message: "Invalid notification type",
      },
      required: [true, "Notification type is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
      minlength: [1, "Title must be at least 1 character long"],
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: [true, "Notification message is required"],
      trim: true,
      minlength: [1, "Message must be at least 1 character long"],
      maxlength: [1000, "Message cannot exceed 1000 characters"],
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for recipient-scoped, organization-scoped, unread, and chronological queries
notificationSchema.index({ organizationId: 1, recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, recipientId: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, recipientId: 1, _id: 1 });
notificationSchema.index({ organizationId: 1, incidentId: 1, type: 1, recipientId: 1 });

export const Notification = model<INotification>("Notification", notificationSchema);
export default Notification;

