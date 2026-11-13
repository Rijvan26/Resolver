import { Schema, model, Document, Types } from "mongoose";

export interface IOrganizationDeletionAudit extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  organizationName: string;
  organizationSlug: string;
  deletedBy: {
    userId: Types.ObjectId;
    email: string;
  };
  counts: Record<string, number>;
  totalRecordsDeleted: number;
  timestamp: Date;
}

const organizationDeletionAuditSchema = new Schema<IOrganizationDeletionAudit>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    organizationName: {
      type: String,
      required: true,
      trim: true,
    },
    organizationSlug: {
      type: String,
      required: true,
      trim: true,
    },
    deletedBy: {
      userId: {
        type: Schema.Types.ObjectId,
        required: true,
      },
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },
    },
    counts: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    totalRecordsDeleted: {
      type: Number,
      required: true,
      default: 0,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
  },
  {
    collection: "organization_deletion_audits",
    timestamps: false,
    versionKey: false,
  }
);

organizationDeletionAuditSchema.index({ organizationId: 1, timestamp: -1 });

export const OrganizationDeletionAudit = model<IOrganizationDeletionAudit>(
  "OrganizationDeletionAudit",
  organizationDeletionAuditSchema
);

export default OrganizationDeletionAudit;

