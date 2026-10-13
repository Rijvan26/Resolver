import { Schema, model, Document, Types } from "mongoose";
import { INVITATION_STATUS, InvitationStatus, ROLES, Role } from "../types";

export interface IInvitation extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  email: string;
  role: Role;
  inviterId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  status: InvitationStatus;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const invitationSchema = new Schema<IInvitation>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address"],
      maxlength: [255, "Email address cannot exceed 255 characters"],
    },
    role: {
      type: String,
      enum: [ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER],
      required: [true, "Invited role is required"],
    },
    inviterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Inviter reference is required"],
    },
    tokenHash: {
      type: String,
      required: [true, "Invitation token hash is required"],
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration timestamp is required"],
    },
    status: {
      type: String,
      enum: Object.values(INVITATION_STATUS),
      default: INVITATION_STATUS.PENDING,
      required: true,
    },
    acceptedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes (tokenHash unique index is declared on field definition)
invitationSchema.index({ organizationId: 1, email: 1, status: 1 });
invitationSchema.index({ organizationId: 1, status: 1 });
invitationSchema.index({ expiresAt: 1 });

export const Invitation = model<IInvitation>("Invitation", invitationSchema);
export default Invitation;
