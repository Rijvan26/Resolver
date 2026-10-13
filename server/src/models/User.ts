import { Schema, model, Document, Types } from "mongoose";
import { ROLES, Role } from "../types";

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  organizationId: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "User name is required"],
      trim: true,
      minlength: [2, "User name must be at least 2 characters"],
      maxlength: [100, "User name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address"],
      maxlength: [255, "Email address cannot exceed 255 characters"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false, // Prevent passwordHash from leaking in accidental find queries
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.DEVELOPER,
      required: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes (email uniqueness index is declared on field definition)
userSchema.index({ organizationId: 1, role: 1 });
userSchema.index({ organizationId: 1, isActive: 1 });

export const User = model<IUser>("User", userSchema);
export default User;
