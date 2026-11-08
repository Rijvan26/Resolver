import { ClientSession, Types } from "mongoose";
import { Comment, IComment } from "../models/Comment";

export interface CreateCommentDaoInput {
  incidentId: Types.ObjectId | string;
  organizationId: Types.ObjectId | string;
  authorId: Types.ObjectId | string;
  content: string;
  parentId?: Types.ObjectId | string | null;
}

export interface CommentPaginationOptions {
  skip?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
  parentId?: Types.ObjectId | string | null;
}

export class CommentDao {
  /**
   * Create a new comment.
   */
  async create(data: CreateCommentDaoInput, session?: ClientSession): Promise<IComment> {
    const comment = new Comment({
      incidentId: data.incidentId,
      organizationId: data.organizationId,
      authorId: data.authorId,
      content: data.content.trim(),
      parentId: data.parentId ?? null,
    });

    return await comment.save({ session });
  }

  /**
   * Find a comment by ID and organization (and optionally incident).
   */
  async findByOrgAndId(
    organizationId: string | Types.ObjectId,
    commentId: string | Types.ObjectId,
    incidentId?: string | Types.ObjectId
  ): Promise<IComment | null> {
    const query: Record<string, unknown> = {
      _id: commentId,
      organizationId,
    };
    if (incidentId) {
      query.incidentId = incidentId;
    }

    return await Comment.findOne(query)
      .populate("authorId", "name email role isActive")
      .exec();
  }

  /**
   * List comments for an incident scoped to organization.
   */
  async findCommentsByIncident(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId,
    options: CommentPaginationOptions = {}
  ): Promise<IComment[]> {
    const sortDirection = options.sortOrder === "desc" ? -1 : 1;

    let cursor = Comment.find({ organizationId, incidentId })
      .sort({ createdAt: sortDirection })
      .populate("authorId", "name email role isActive");

    if (options.skip !== undefined) {
      cursor = cursor.skip(options.skip);
    }
    if (options.limit !== undefined) {
      cursor = cursor.limit(options.limit);
    }

    return await cursor.exec();
  }

  /**
   * Count comments for an incident scoped to organization.
   */
  async countCommentsByIncident(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId
  ): Promise<number> {
    return await Comment.countDocuments({ organizationId, incidentId }).exec();
  }

  /**
   * Update a comment content scoped to organization.
   */
  async updateByOrgAndId(
    organizationId: string | Types.ObjectId,
    commentId: string | Types.ObjectId,
    content: string,
    session?: ClientSession
  ): Promise<IComment | null> {
    return await Comment.findOneAndUpdate(
      { _id: commentId, organizationId },
      { $set: { content: content.trim() } },
      { returnDocument: "after", session }
    )
      .populate("authorId", "name email role isActive")
      .exec();
  }

  /**
   * Find replies for a comment thread.
   */
  async findReplies(
    organizationId: string | Types.ObjectId,
    parentId: string | Types.ObjectId
  ): Promise<IComment[]> {
    return await Comment.find({ organizationId, parentId })
      .sort({ createdAt: 1 })
      .populate("authorId", "name email role isActive")
      .exec();
  }

  /**
   * Delete a comment scoped to organization.
   */
  async deleteByOrgAndId(
    organizationId: string | Types.ObjectId,
    commentId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<boolean> {
    const result = await Comment.findOneAndDelete(
      { _id: commentId, organizationId },
      { session }
    ).exec();

    if (result) {
      await Comment.deleteMany(
        { parentId: commentId, organizationId },
        { session }
      ).exec();
    }

    return result !== null;
  }
}

export const commentDao = new CommentDao();
export default commentDao;
