import { Types } from "mongoose";
import { AiSuggestion, IAiSuggestion } from "../models/AiSuggestion";
import { AiSuggestionType, AiUserDecision } from "../types";

export interface CreateAiSuggestionDto {
  incidentId: string | Types.ObjectId;
  organizationId: string | Types.ObjectId;
  type: AiSuggestionType;
  inputHash: string;
  output: Record<string, unknown>;
  model: string;
  provider: string;
  latencyMs?: number;
  status?: "ready" | "failed" | "unavailable";
}

export interface FindAuditLogsFilter {
  type?: AiSuggestionType;
  userDecision?: AiUserDecision;
  startDate?: Date;
  endDate?: Date;
}

export interface AuditLogPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface AuditMetrics {
  totalSuggestions: number;
  acceptedCount: number;
  editedCount: number;
  dismissedCount: number;
  pendingCount: number;
  agreementRate: number;
  avgLatencyMs: number;
}

export class AiSuggestionDao {
  async create(data: CreateAiSuggestionDto): Promise<IAiSuggestion> {
    return AiSuggestion.create(data);
  }

  async findById(id: string | Types.ObjectId): Promise<IAiSuggestion | null> {
    return AiSuggestion.findById(id).populate("decidedBy", "name email role").exec();
  }

  async findByOrgAndId(
    organizationId: string | Types.ObjectId,
    id: string | Types.ObjectId
  ): Promise<IAiSuggestion | null> {
    return AiSuggestion.findOne({
      _id: id,
      organizationId,
    })
      .populate("decidedBy", "name email role")
      .exec();
  }

  async findByInputHash(inputHash: string): Promise<IAiSuggestion | null> {
    return AiSuggestion.findOne({ inputHash })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findLatestByIncidentAndType(
    incidentId: string | Types.ObjectId,
    type: AiSuggestionType
  ): Promise<IAiSuggestion | null> {
    return AiSuggestion.findOne({ incidentId, type })
      .sort({ createdAt: -1 })
      .populate("decidedBy", "name email role")
      .exec();
  }

  async findByIncident(
    incidentId: string | Types.ObjectId,
    type?: AiSuggestionType
  ): Promise<IAiSuggestion[]> {
    const query: Record<string, unknown> = { incidentId };
    if (type) query.type = type;
    return AiSuggestion.find(query)
      .sort({ createdAt: -1 })
      .populate("decidedBy", "name email role")
      .exec();
  }

  async updateDecision(
    id: string | Types.ObjectId,
    decision: AiUserDecision,
    decidedBy: string | Types.ObjectId,
    editedOutput?: Record<string, unknown> | null
  ): Promise<IAiSuggestion | null> {
    return AiSuggestion.findByIdAndUpdate(
      id,
      {
        $set: {
          userDecision: decision,
          decidedBy,
          decidedAt: new Date(),
          ...(editedOutput !== undefined ? { editedOutput } : {}),
        },
      },
      { returnDocument: "after" }
    ).exec();
  }

  async updateDecisionByOrgAndId(
    organizationId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    decision: AiUserDecision,
    decidedBy: string | Types.ObjectId,
    editedOutput?: Record<string, unknown> | null
  ): Promise<IAiSuggestion | null> {
    return AiSuggestion.findOneAndUpdate(
      { _id: id, organizationId },
      {
        $set: {
          userDecision: decision,
          decidedBy,
          decidedAt: new Date(),
          ...(editedOutput !== undefined ? { editedOutput } : {}),
        },
      },
      { returnDocument: "after" }
    )
      .populate("decidedBy", "name email role")
      .exec();
  }

  /**
   * Find paginated AI audit suggestions scoped strictly to organization with optional filters
   */
  async findAuditLogs(
    organizationId: string | Types.ObjectId,
    filter: FindAuditLogsFilter = {},
    pagination: AuditLogPaginationOptions = {}
  ): Promise<{
    suggestions: IAiSuggestion[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const orgId =
      typeof organizationId === "string" ? new Types.ObjectId(organizationId) : organizationId;

    const query: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (filter.type) {
      query.type = filter.type;
    }

    if (filter.userDecision) {
      query.userDecision = filter.userDecision;
    }

    if (filter.startDate || filter.endDate) {
      const dateQuery: Record<string, unknown> = {};
      if (filter.startDate) {
        dateQuery.$gte = filter.startDate;
      }
      if (filter.endDate) {
        dateQuery.$lte = filter.endDate;
      }
      query.createdAt = dateQuery;
    }

    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(100, Math.max(1, pagination.limit || 20));
    const skip = (page - 1) * limit;

    const sortOrder = pagination.sortOrder === "asc" ? 1 : -1;
    const sortField = pagination.sortBy || "createdAt";

    const [suggestions, total] = await Promise.all([
      AiSuggestion.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .populate("incidentId", "title priority status")
        .populate("decidedBy", "name email role")
        .exec(),
      AiSuggestion.countDocuments(query).exec(),
    ]);

    return {
      suggestions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Aggregates telemetry metrics (agreement rate, average latency, decisions breakdown)
   */
  async getAuditMetrics(
    organizationId: string | Types.ObjectId,
    filter: FindAuditLogsFilter = {}
  ): Promise<AuditMetrics> {
    const orgId =
      typeof organizationId === "string" ? new Types.ObjectId(organizationId) : organizationId;

    const matchQuery: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (filter.type) {
      matchQuery.type = filter.type;
    }

    if (filter.startDate || filter.endDate) {
      const dateQuery: Record<string, unknown> = {};
      if (filter.startDate) {
        dateQuery.$gte = filter.startDate;
      }
      if (filter.endDate) {
        dateQuery.$lte = filter.endDate;
      }
      matchQuery.createdAt = dateQuery;
    }

    const [metrics] = await AiSuggestion.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSuggestions: { $sum: 1 },
          acceptedCount: {
            $sum: { $cond: [{ $eq: ["$userDecision", "accepted"] }, 1, 0] },
          },
          editedCount: {
            $sum: { $cond: [{ $eq: ["$userDecision", "edited"] }, 1, 0] },
          },
          dismissedCount: {
            $sum: { $cond: [{ $eq: ["$userDecision", "dismissed"] }, 1, 0] },
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ["$userDecision", "pending"] }, 1, 0] },
          },
          avgLatencyMs: { $avg: "$latencyMs" },
        },
      },
    ]).exec();

    if (!metrics) {
      return {
        totalSuggestions: 0,
        acceptedCount: 0,
        editedCount: 0,
        dismissedCount: 0,
        pendingCount: 0,
        agreementRate: 0,
        avgLatencyMs: 0,
      };
    }

    const totalDecided = metrics.acceptedCount + metrics.editedCount + metrics.dismissedCount;
    const agreementRate =
      totalDecided > 0 ? Math.round((metrics.acceptedCount / totalDecided) * 1000) / 10 : 0;

    return {
      totalSuggestions: metrics.totalSuggestions,
      acceptedCount: metrics.acceptedCount,
      editedCount: metrics.editedCount,
      dismissedCount: metrics.dismissedCount,
      pendingCount: metrics.pendingCount,
      agreementRate,
      avgLatencyMs: Math.round(metrics.avgLatencyMs || 0),
    };
  }
}

export const aiSuggestionDao = new AiSuggestionDao();
export default aiSuggestionDao;

