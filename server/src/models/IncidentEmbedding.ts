import { Schema, model, Document, Types } from "mongoose";

export interface IIncidentEmbedding extends Document {
  _id: Types.ObjectId;
  incidentId: Types.ObjectId;
  organizationId: Types.ObjectId;
  vector: number[];
  model: string;
  provider: string;
  dim: number;
  textHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const incidentEmbeddingSchema = new Schema<IIncidentEmbedding>(
  {
    incidentId: {
      type: Schema.Types.ObjectId,
      ref: "Incident",
      required: [true, "Incident ID is required"],
      unique: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization ID is required"],
      index: true,
    },
    vector: {
      type: [Number],
      required: [true, "Embedding vector is required"],
    },
    model: {
      type: String,
      required: [true, "Model name is required"],
      trim: true,
    },
    provider: {
      type: String,
      required: [true, "Provider name is required"],
      trim: true,
    },
    dim: {
      type: Number,
      required: [true, "Embedding dimension is required"],
    },
    textHash: {
      type: String,
      required: [true, "Text content hash is required"],
      trim: true,
      index: true,
    },
  },
  {
    collection: "incident_embeddings",
    timestamps: true,
    versionKey: false,
  }
);

// Compound index for organization-scoped embedding queries
incidentEmbeddingSchema.index({ organizationId: 1, incidentId: 1 });

export const IncidentEmbedding = model<IIncidentEmbedding>(
  "IncidentEmbedding",
  incidentEmbeddingSchema
);

export default IncidentEmbedding;

