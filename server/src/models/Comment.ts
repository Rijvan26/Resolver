import { Schema, model, Document, Types } from "mongoose";

export interface IComment extends Document {
  _id: Types.ObjectId;
  incidentId: Types.ObjectId;
  organizationId: Types.ObjectId;
  authorId: Types.ObjectId;
  parentId?: Types.ObjectId | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
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
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Author reference is required"],
      index: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },
    content: {
      type: String,
      required: [true, "Comment content is required"],
      trim: true,
      minlength: [1, "Comment content must be at least 1 character"],
      maxlength: [5000, "Comment content cannot exceed 5000 characters"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

commentSchema.index({ organizationId: 1, incidentId: 1, createdAt: 1 });
commentSchema.index({ organizationId: 1, incidentId: 1, _id: 1 });
commentSchema.index({ organizationId: 1, incidentId: 1, parentId: 1, createdAt: 1 });
commentSchema.index({ organizationId: 1, parentId: 1, createdAt: 1 });

export const Comment = model<IComment>("Comment", commentSchema);
export default Comment;
