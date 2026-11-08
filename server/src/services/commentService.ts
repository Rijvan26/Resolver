import { Types } from "mongoose";
import { commentDao, CommentPaginationOptions } from "../dao/commentDao";
import { incidentDao } from "../dao/incidentDao";
import { activityDao } from "../dao/activityDao";
import { notificationEventService } from "./notificationEventService";
import { IComment } from "../models/Comment";
import { ACTIVITY_ACTION, ROLES, Role } from "../types";
import { NotFoundError, ForbiddenError } from "../utils/errors";
import {
  CreateCommentInput,
  UpdateCommentInput,
  ListCommentsQueryInput,
} from "../validations/commentValidation";
import { UserSummary } from "./incidentService";

export interface SafeCommentDetails {
  id: string;
  incidentId: string;
  organizationId: string;
  author: UserSummary;
  content: string;
  parentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedCommentsResult {
  comments: SafeCommentDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Format a Mongoose comment document into a safe API response.
 */
const formatComment = (doc: IComment): SafeCommentDetails => {
  const populatedAuthor = doc.authorId as unknown as {
    _id?: Types.ObjectId;
    name?: string;
    email?: string;
    role?: Role;
    isActive?: boolean;
  };

  const authorFormatted: UserSummary = populatedAuthor?._id
    ? {
        id: populatedAuthor._id.toString(),
        name: populatedAuthor.name || "",
        email: populatedAuthor.email || "",
        role: populatedAuthor.role || ("DEVELOPER" as Role),
        isActive: populatedAuthor.isActive,
      }
    : {
        id: doc.authorId.toString(),
        name: "",
        email: "",
        role: "DEVELOPER" as Role,
      };

  return {
    id: doc._id.toString(),
    incidentId: doc.incidentId.toString(),
    organizationId: doc.organizationId.toString(),
    author: authorFormatted,
    content: doc.content,
    parentId: doc.parentId ? doc.parentId.toString() : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

export class CommentService {
  /**
   * Add a comment to an incident.
   * Ensures incident exists in caller's organization.
   * If parentId is provided, ensures parent comment exists on this incident.
   * Generates a COMMENT_ADDED audit record on success.
   */
  async createComment(
    organizationId: string,
    userId: string,
    incidentId: string,
    input: CreateCommentInput
  ): Promise<SafeCommentDetails> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found in organization");
    }

    if (input.parentId) {
      const parent = await commentDao.findByOrgAndId(organizationId, input.parentId, incidentId);
      if (!parent) {
        throw new NotFoundError("Parent comment not found to reply to");
      }
    }

    const created = await commentDao.create({
      incidentId,
      organizationId,
      authorId: userId,
      content: input.content,
      parentId: input.parentId || null,
    });

    // Record persistent audit entry
    await activityDao.create({
      organizationId,
      incidentId,
      actorId: userId,
      action: ACTIVITY_ACTION.COMMENT_ADDED,
      metadata: { commentId: created._id, parentId: input.parentId || null },
    });

    // Dispatch comment added notification to assignee and creator
    try {
      const currentAssigneeId = incident.assigneeId
        ? (incident.assigneeId as unknown as { _id?: Types.ObjectId })._id
          ? (incident.assigneeId as unknown as { _id: Types.ObjectId })._id.toString()
          : incident.assigneeId.toString()
        : null;

      const incidentCreatorId = (incident.createdBy as unknown as { _id?: Types.ObjectId })._id
        ? (incident.createdBy as unknown as { _id: Types.ObjectId })._id.toString()
        : incident.createdBy.toString();

      await notificationEventService.handleCommentAdded({
        organizationId,
        incidentId,
        incidentTitle: incident.title,
        actorId: userId,
        commentId: created._id.toString(),
        commentContent: input.content,
        assigneeId: currentAssigneeId,
        createdBy: incidentCreatorId,
      });
    } catch (notifErr) {
      console.error("⚠️ [CommentService] Failed to dispatch comment notification:", notifErr);
    }

    const populated = await commentDao.findByOrgAndId(organizationId, created._id, incidentId);
    return formatComment(populated || created);
  }

  /**
   * List comments for an incident with pagination.
   */
  async listComments(
    organizationId: string,
    incidentId: string,
    query: ListCommentsQueryInput
  ): Promise<PaginatedCommentsResult> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found in organization");
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const options: CommentPaginationOptions = {
      skip,
      limit,
      sortOrder: query.sortOrder || "asc",
    };

    const [docs, total] = await Promise.all([
      commentDao.findCommentsByIncident(organizationId, incidentId, options),
      commentDao.countCommentsByIncident(organizationId, incidentId),
    ]);

    const comments = docs.map(formatComment);

    return {
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Update a comment.
   * Only the original author is permitted to modify their comment content.
   * Generates a COMMENT_UPDATED audit record on success.
   */
  async updateComment(
    organizationId: string,
    userId: string,
    _userRole: Role,
    incidentId: string,
    commentId: string,
    input: UpdateCommentInput
  ): Promise<SafeCommentDetails> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found in organization");
    }

    const comment = await commentDao.findByOrgAndId(organizationId, commentId, incidentId);
    if (!comment) {
      throw new NotFoundError("Comment not found in incident");
    }

    const authorIdStr = (comment.authorId as unknown as { _id?: Types.ObjectId })._id
      ? (comment.authorId as unknown as { _id: Types.ObjectId })._id.toString()
      : comment.authorId.toString();

    if (authorIdStr !== userId) {
      throw new ForbiddenError("You can only edit your own comments");
    }

    const updated = await commentDao.updateByOrgAndId(
      organizationId,
      commentId,
      input.content
    );

    if (!updated) {
      throw new NotFoundError("Comment not found in incident");
    }

    // Record persistent audit entry
    await activityDao.create({
      organizationId,
      incidentId,
      actorId: userId,
      action: ACTIVITY_ACTION.COMMENT_UPDATED,
      metadata: { commentId: comment._id },
    });

    return formatComment(updated);
  }

  /**
   * Delete a comment.
   * Permitted for original author OR organization SUPER_ADMIN / ADMIN.
   * Generates a COMMENT_DELETED audit record on success.
   */
  async deleteComment(
    organizationId: string,
    userId: string,
    userRole: Role,
    incidentId: string,
    commentId: string
  ): Promise<void> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found in organization");
    }

    const comment = await commentDao.findByOrgAndId(organizationId, commentId, incidentId);
    if (!comment) {
      throw new NotFoundError("Comment not found in incident");
    }

    const authorIdStr = (comment.authorId as unknown as { _id?: Types.ObjectId })._id
      ? (comment.authorId as unknown as { _id: Types.ObjectId })._id.toString()
      : comment.authorId.toString();

    const isAuthor = authorIdStr === userId;
    const isAdminOrSuper = userRole === ROLES.SUPER_ADMIN || userRole === ROLES.ADMIN;

    if (!isAuthor && !isAdminOrSuper) {
      throw new ForbiddenError("You do not have permission to delete this comment");
    }

    await commentDao.deleteByOrgAndId(organizationId, commentId);

    // Record persistent audit entry
    await activityDao.create({
      organizationId,
      incidentId,
      actorId: userId,
      action: ACTIVITY_ACTION.COMMENT_DELETED,
      metadata: { commentId: comment._id },
    });
  }

  /**
   * List all replies for a specific comment thread.
   */
  async listReplies(
    organizationId: string,
    incidentId: string,
    commentId: string
  ): Promise<SafeCommentDetails[]> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found in organization");
    }

    const parent = await commentDao.findByOrgAndId(organizationId, commentId, incidentId);
    if (!parent) {
      throw new NotFoundError("Comment not found in incident");
    }

    const replies = await commentDao.findReplies(organizationId, commentId);
    return replies.map(formatComment);
  }
}

export const commentService = new CommentService();
export default commentService;
