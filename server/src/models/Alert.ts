import { Schema, model, Document, Types } from "mongoose";
import {
  INCIDENT_PRIORITY,
  IncidentPriority,
  ALERT_STATUS,
  AlertStatus,
} from "../types";

export interface IAlert extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  serviceId: Types.ObjectId;
  title: string;
  description: string;
  severity: IncidentPriority;
  source: string;
  fingerprint: string;
  incidentId?: Types.ObjectId | null;
  suggestedIncidentId?: Types.ObjectId | null;
  status: AlertStatus;
  metadata?: Record<string, unknown>;
  seeded?: boolean;
  benchSession?: string;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<IAlert>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
      index: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: [true, "Service reference is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Alert title is required"],
      trim: true,
      minlength: [2, "Alert title must be at least 2 characters"],
      maxlength: [200, "Alert title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Alert description is required"],
      trim: true,
      minlength: [2, "Alert description must be at least 2 characters"],
      maxlength: [5000, "Alert description cannot exceed 5000 characters"],
    },
    severity: {
      type: String,
      enum: {
        values: Object.values(INCIDENT_PRIORITY),
        message: "Severity must be LOW, MEDIUM, HIGH, or CRITICAL",
      },
      default: INCIDENT_PRIORITY.MEDIUM,
      required: true,
    },
    source: {
      type: String,
      default: "custom",
      trim: true,
    },
    fingerprint: {
      type: String,
      required: [true, "Alert fingerprint is required"],
      trim: true,
      index: true,
    },
    incidentId: {
      type: Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
      index: true,
    },
    suggestedIncidentId: {
      type: Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: Object.values(ALERT_STATUS),
        message: "Status must be open, grouped, or dismissed",
      },
      default: ALERT_STATUS.OPEN,
      required: true,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
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

// Compound indexes for organizational isolation and deduplication queries
alertSchema.index({ organizationId: 1, fingerprint: 1, createdAt: -1 });
alertSchema.index({ organizationId: 1, serviceId: 1, status: 1, createdAt: -1 });
alertSchema.index({ organizationId: 1, incidentId: 1 });
alertSchema.index({ organizationId: 1, suggestedIncidentId: 1 });

export const Alert = model<IAlert>("Alert", alertSchema);

