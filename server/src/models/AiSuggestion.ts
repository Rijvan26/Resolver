import { Schema, model, Document, Types } from "mongoose";
import {
  AiSuggestionType,
  AI_SUGGESTION_TYPE,
  AiUserDecision,
  AI_USER_DECISION,
} from "../types";

export interface IAiSuggestion {
  _id: Types.ObjectId;
  incidentId: Types.ObjectId;
  organizationId: Types.ObjectId;
  type: AiSuggestionType;
  inputHash: string;
  output: Record<string, unknown>;
  model: string;
  provider: string;
  latencyMs: number;
  status: "ready" | "failed" | "unavailable";
  userDecision: AiUserDecision;
  editedOutput?: Record<string, unknown> | null;
  decidedBy?: Types.ObjectId | null;
  decidedAt?: Date | null;
  createdAt: Date;
}

const aiSuggestionSchema = new Schema<IAiSuggestion>(
  {
    incidentId: {
      type: Schema.Types.ObjectId,
      ref: "Incident",
      required: [true, "Incident reference is required"],
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: Object.values(AI_SUGGESTION_TYPE),
        message: "Suggestion type must be triage, summary, or postmortem",
      },
      required: [true, "Suggestion type is required"],
      index: true,
    },
    inputHash: {
      type: String,
      required: [true, "Input hash is required"],
    },
    output: {
      type: Schema.Types.Mixed,
      required: [true, "Suggestion output is required"],
    },
    model: {
      type: String,
      required: [true, "Model identifier is required"],
      trim: true,
    },
    provider: {
      type: String,
      required: [true, "Provider identifier is required"],
      trim: true,
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["ready", "failed", "unavailable"],
      default: "ready",
      index: true,
    },
    userDecision: {
      type: String,
      enum: {
        values: Object.values(AI_USER_DECISION),
        message: "Decision must be pending, accepted, edited, or dismissed",
      },
      default: AI_USER_DECISION.PENDING,
      index: true,
    },
    editedOutput: {
      type: Schema.Types.Mixed,
      default: null,
    },
    decidedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
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
    collection: "ai_suggestions",
  }
);

// Indexes on incidentId and inputHash (as explicitly required)
aiSuggestionSchema.index({ incidentId: 1, createdAt: -1 });
aiSuggestionSchema.index({ inputHash: 1 });
aiSuggestionSchema.index({ organizationId: 1, type: 1, createdAt: -1 });

export const AiSuggestion = model<IAiSuggestion>("AiSuggestion", aiSuggestionSchema);
export default AiSuggestion;
