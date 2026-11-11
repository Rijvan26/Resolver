import { Schema, model, Document, Types } from "mongoose";
import "./Service";
import {
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  IncidentStatus,
  IncidentPriority,
  IncidentAiSubdocument,
  AI_STATUS,
} from "../types";

export interface IIncident extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  organizationId: Types.ObjectId;
  createdBy: Types.ObjectId;
  assigneeId?: Types.ObjectId | null;
  serviceId?: Types.ObjectId | null;
  finalSeverity?: IncidentPriority | null;
  aiAccepted?: boolean;
  ai?: IncidentAiSubdocument;
  linkedIncidentIds?: Types.ObjectId[];
  duplicateOf?: Types.ObjectId | null;
  alertCount?: number;
  resolvedAt?: Date | null;
  seeded?: boolean;
  benchSession?: string;
  createdAt: Date;
  updatedAt: Date;
}

const incidentSchema = new Schema<IIncident>(
  {
    title: {
      type: String,
      required: [true, "Incident title is required"],
      trim: true,
      minlength: [2, "Incident title must be at least 2 characters"],
      maxlength: [200, "Incident title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Incident description is required"],
      trim: true,
      minlength: [2, "Incident description must be at least 2 characters"],
      maxlength: [5000, "Incident description cannot exceed 5000 characters"],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(INCIDENT_STATUS),
        message: "Status must be OPEN, IN_PROGRESS, RESOLVED, or CLOSED",
      },
      default: INCIDENT_STATUS.OPEN,
      required: true,
    },
    priority: {
      type: String,
      enum: {
        values: Object.values(INCIDENT_PRIORITY),
        message: "Priority must be LOW, MEDIUM, HIGH, or CRITICAL",
      },
      default: INCIDENT_PRIORITY.MEDIUM,
      required: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator reference is required"],
      index: true,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      default: null,
      index: true,
    },
    finalSeverity: {
      type: String,
      enum: [...Object.values(INCIDENT_PRIORITY), null],
      default: null,
    },
    aiAccepted: {
      type: Boolean,
      default: false,
    },
    ai: {
      type: {
        severity: {
          type: String,
          enum: [...Object.values(INCIDENT_PRIORITY), null],
          default: null,
        },
        reason: { type: String, default: null },
        confidence: { type: Number, default: null },
        model: { type: String, default: null },
        provider: { type: String, default: null },
        suggestedService: { type: String, default: null },
        suggestedTeam: { type: String, default: null },
        summary: { type: String, default: null },
        summaryUpdatedAt: { type: Date, default: null },
        status: {
          type: String,
          enum: Object.values(AI_STATUS),
          default: AI_STATUS.NONE,
        },
      },
      _id: false,
      default: () => ({ status: AI_STATUS.NONE }),
    },
    linkedIncidentIds: {
      type: [Schema.Types.ObjectId],
      ref: "Incident",
      default: [],
    },
    duplicateOf: {
      type: Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
    },
    alertCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    resolvedAt: {
      type: Date,
      default: null,
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

// Compound indexes for performant multi-tenant filtered & sorted queries
incidentSchema.index({ organizationId: 1, status: 1 });
incidentSchema.index({ organizationId: 1, priority: 1 });
incidentSchema.index({ organizationId: 1, assigneeId: 1 });
incidentSchema.index({ organizationId: 1, serviceId: 1 });
incidentSchema.index({ organizationId: 1, createdAt: -1 });
incidentSchema.index({ organizationId: 1, updatedAt: -1 });
incidentSchema.index({ organizationId: 1, resolvedAt: 1 });

export const Incident = model<IIncident>("Incident", incidentSchema);
export default Incident;
