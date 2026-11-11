import { Types } from "mongoose";
import { AiSuggestion, IAiSuggestion } from "../models/AiSuggestion";
import { AiSuggestionType, AiUserDecision } from "../types";
import { redact } from "../services/ai/redaction";

/**
 * Recursively redacts sensitive tokens, API keys, passwords, and PII from objects
 * before persisting to the ai_suggestions audit log.
 */
export function deepRedact(val: unknown): unknown {
  if (typeof val === "string") {
    return redact(val);
  }
  if (Array.isArray(val)) {
    return val.map(deepRedact);
  }
  if (val !== null && typeof val === "object" && !(val instanceof Types.ObjectId) && !(val instanceof Date)) {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      sanitized[k] = deepRedact(v);
    }
    return sanitized;
  }
  return val;
}

export interface CreateAiSuggestionDto {
  incidentId?: string | Types.ObjectId | null;
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

export interface DuplicateMetrics {
  total: number;
  linked: number;
  dismissed: number;
  pending: number;
  falseLinkRate: number; // percentage of duplicate suggestions dismissed (false positive matches)
}

export interface AuditMetrics {
  totalSuggestions: number;
  acceptedCount: number;
  editedCount: number;
  dismissedCount: number;
  pendingCount: number;
  agreementRate: number;
  avgLatencyMs: number;
  duplicateMetrics?: DuplicateMetrics;
}

export class AiSuggestionDao {
  async create(data: CreateAiSuggestionDto): Promise<IAiSuggestion> {
    const sanitizedOutput = (deepRedact(data.output) as Record<string, unknown>) || {};
    return AiSuggestion.create({
      ...data,
      output: sanitizedOutput,
    });
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
          duplicateTotal: {
            $sum: { $cond: [{ $eq: ["$type", "duplicate"] }, 1, 0] },
          },
          duplicateLinked: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "duplicate"] },
                    { $eq: ["$userDecision", "accepted"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          duplicateDismissed: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "duplicate"] },
                    { $eq: ["$userDecision", "dismissed"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          duplicatePending: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "duplicate"] },
                    { $eq: ["$userDecision", "pending"] },
                  ],
                },
                1,
                0,
              ],
            },
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
        duplicateMetrics: {
          total: 0,
          linked: 0,
          dismissed: 0,
          pending: 0,
          falseLinkRate: 0,
        },
      };
    }

    const totalDecided = metrics.acceptedCount + metrics.editedCount + metrics.dismissedCount;
    const agreementRate =
      totalDecided > 0 ? Math.round((metrics.acceptedCount / totalDecided) * 1000) / 10 : 0;

    const dupDecided = (metrics.duplicateLinked || 0) + (metrics.duplicateDismissed || 0);
    const falseLinkRate =
      dupDecided > 0
        ? Math.round(((metrics.duplicateDismissed || 0) / dupDecided) * 1000) / 10
        : 0;

    return {
      totalSuggestions: metrics.totalSuggestions,
      acceptedCount: metrics.acceptedCount,
      editedCount: metrics.editedCount,
      dismissedCount: metrics.dismissedCount,
      pendingCount: metrics.pendingCount,
      agreementRate,
      avgLatencyMs: Math.round(metrics.avgLatencyMs || 0),
      duplicateMetrics: {
        total: metrics.duplicateTotal || 0,
        linked: metrics.duplicateLinked || 0,
        dismissed: metrics.duplicateDismissed || 0,
        pending: metrics.duplicatePending || 0,
        falseLinkRate,
      },
    };
  }

  /**
   * Count suggestions generated today for an organization (for daily cap tracking)
   */
  async countTodayByOrg(
    organizationId: string | Types.ObjectId,
    type?: AiSuggestionType
  ): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const query: Record<string, unknown> = {
      organizationId,
      createdAt: { $gte: startOfDay },
    };
    if (type) query.type = type;

    return AiSuggestion.countDocuments(query).exec();
  }
}

export const aiSuggestionDao = new AiSuggestionDao();
export default aiSuggestionDao;

