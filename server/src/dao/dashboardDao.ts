import { Types } from "mongoose";
import { Incident } from "../models/Incident";
import { User } from "../models/User";
import { Activity } from "../models/Activity";
import {
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  IncidentStatus,
  IncidentPriority,
  ACTIVITY_ACTION,
  Role,
} from "../types";

export interface OverviewStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  criticalUnresolved: number;
  createdInRange: number;
  resolvedInRange: number;
}

export interface DailyTrendEntry {
  date: string;
  created: number;
  resolved: number;
}

export interface TeamMemberWorkload {
  member: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  open: number;
  inProgress: number;
  totalUnresolved: number;
}

export class DashboardDao {
  /**
   * Aggregates organization-wide incident overview stats in a single database round-trip using $facet.
   */
  async getOverview(
    organizationId: string | Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<OverviewStats> {
    const orgId = typeof organizationId === "string" ? new Types.ObjectId(organizationId) : organizationId;

    const rangeCreatedFilter =
      startDate && endDate ? { createdAt: { $gte: startDate, $lte: endDate } } : {};

    const rangeResolvedFilter =
      startDate && endDate
        ? {
            $or: [
              { resolvedAt: { $gte: startDate, $lte: endDate } },
              {
                resolvedAt: null,
                status: INCIDENT_STATUS.RESOLVED,
                updatedAt: { $gte: startDate, $lte: endDate },
              },
            ],
          }
        : {};

    const results = await Incident.aggregate([
      { $match: { organizationId: orgId } },
      {
        $facet: {
          total: [{ $count: "count" }],
          open: [{ $match: { status: INCIDENT_STATUS.OPEN } }, { $count: "count" }],
          inProgress: [{ $match: { status: INCIDENT_STATUS.IN_PROGRESS } }, { $count: "count" }],
          resolved: [{ $match: { status: INCIDENT_STATUS.RESOLVED } }, { $count: "count" }],
          closed: [{ $match: { status: INCIDENT_STATUS.CLOSED } }, { $count: "count" }],
          criticalUnresolved: [
            {
              $match: {
                priority: INCIDENT_PRIORITY.CRITICAL,
                status: { $in: [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IN_PROGRESS] },
              },
            },
            { $count: "count" },
          ],
          createdInRange:
            startDate && endDate
              ? [{ $match: rangeCreatedFilter }, { $count: "count" }]
              : [{ $match: { $expr: { $eq: [1, 1] } } }, { $count: "count" }],
          resolvedInRange:
            startDate && endDate
              ? [{ $match: rangeResolvedFilter }, { $count: "count" }]
              : [{ $match: { status: INCIDENT_STATUS.RESOLVED } }, { $count: "count" }],
        },
      },
    ]);

    const facet = results[0] || {};

    return {
      total: facet.total?.[0]?.count || 0,
      open: facet.open?.[0]?.count || 0,
      inProgress: facet.inProgress?.[0]?.count || 0,
      resolved: facet.resolved?.[0]?.count || 0,
      closed: facet.closed?.[0]?.count || 0,
      criticalUnresolved: facet.criticalUnresolved?.[0]?.count || 0,
      createdInRange: facet.createdInRange?.[0]?.count || 0,
      resolvedInRange: facet.resolvedInRange?.[0]?.count || 0,
    };
  }

  /**
   * Aggregates counts grouped by incident status, ensuring predictable return shape.
   */
  async getStatusDistribution(
    organizationId: string | Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<Record<IncidentStatus, number>> {
    const orgId = typeof organizationId === "string" ? new Types.ObjectId(organizationId) : organizationId;

    const matchStage: Record<string, unknown> = { organizationId: orgId };
    if (startDate && endDate) {
      matchStage.createdAt = { $gte: startDate, $lte: endDate };
    }

    const aggregated = await Incident.aggregate<{ _id: IncidentStatus; count: number }>([
      { $match: matchStage },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const distribution: Record<IncidentStatus, number> = {
      [INCIDENT_STATUS.OPEN]: 0,
      [INCIDENT_STATUS.IN_PROGRESS]: 0,
      [INCIDENT_STATUS.RESOLVED]: 0,
      [INCIDENT_STATUS.CLOSED]: 0,
    };

    for (const item of aggregated) {
      if (item._id in distribution) {
        distribution[item._id] = item.count;
      }
    }

    return distribution;
  }

  /**
   * Aggregates counts grouped by incident priority, ensuring predictable return shape.
   */
  async getPriorityDistribution(
    organizationId: string | Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<Record<IncidentPriority, number>> {
    const orgId = typeof organizationId === "string" ? new Types.ObjectId(organizationId) : organizationId;

    const matchStage: Record<string, unknown> = { organizationId: orgId };
    if (startDate && endDate) {
      matchStage.createdAt = { $gte: startDate, $lte: endDate };
    }

    const aggregated = await Incident.aggregate<{ _id: IncidentPriority; count: number }>([
      { $match: matchStage },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]);

    const distribution: Record<IncidentPriority, number> = {
      [INCIDENT_PRIORITY.LOW]: 0,
      [INCIDENT_PRIORITY.MEDIUM]: 0,
      [INCIDENT_PRIORITY.HIGH]: 0,
      [INCIDENT_PRIORITY.CRITICAL]: 0,
    };

    for (const item of aggregated) {
      if (item._id in distribution) {
        distribution[item._id] = item.count;
      }
    }

    return distribution;
  }

  /**
   * Calculates daily creation and resolution metrics over a date range.
   */
  async getDailyTrends(
    organizationId: string | Types.ObjectId,
    startDate: Date,
    endDate: Date
  ): Promise<{ creations: Map<string, number>; resolutions: Map<string, number> }> {
    const orgId = typeof organizationId === "string" ? new Types.ObjectId(organizationId) : organizationId;

    // 1. Group incident creations by UTC date string
    const creationsAgg = await Incident.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          organizationId: orgId,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
          count: { $sum: 1 },
        },
      },
    ]);

    // 2. Group resolutions by UTC date string using resolvedAt where present
    const resolutionsAgg = await Incident.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          organizationId: orgId,
          resolvedAt: { $ne: null, $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$resolvedAt", timezone: "UTC" } },
          count: { $sum: 1 },
        },
      },
    ]);

    // 3. For backwards compatibility, also include resolutions recorded via Activity audit
    const activityResolutionsAgg = await Activity.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          organizationId: orgId,
          action: ACTIVITY_ACTION.STATUS_CHANGED,
          "metadata.after.status": INCIDENT_STATUS.RESOLVED,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
          count: { $sum: 1 },
        },
      },
    ]);

    const creationsMap = new Map<string, number>();
    for (const item of creationsAgg) {
      creationsMap.set(item._id, item.count);
    }

    const resolutionsMap = new Map<string, number>();
    for (const item of resolutionsAgg) {
      resolutionsMap.set(item._id, item.count);
    }

    // Combine any activity resolutions if resolvedAt wasn't yet tracked
    for (const item of activityResolutionsAgg) {
      const existing = resolutionsMap.get(item._id) || 0;
      if (item.count > existing) {
        resolutionsMap.set(item._id, item.count);
      }
    }

    return { creations: creationsMap, resolutions: resolutionsMap };
  }

  /**
   * Aggregates team workload: assigned open and in-progress incidents per eligible active member.
   */
  async getTeamWorkload(organizationId: string | Types.ObjectId): Promise<TeamMemberWorkload[]> {
    const orgId = typeof organizationId === "string" ? new Types.ObjectId(organizationId) : organizationId;

    // 1. Fetch eligible active organization members (excludes passwordHash)
    const members = await User.find({
      organizationId: orgId,
      isActive: true,
    })
      .select("_id name email role")
      .sort({ name: 1 })
      .lean();

    // 2. Aggregate active workload per assignee in a single pipeline
    const workloadAgg = await Incident.aggregate<{
      _id: Types.ObjectId;
      open: number;
      inProgress: number;
      totalUnresolved: number;
    }>([
      {
        $match: {
          organizationId: orgId,
          assigneeId: { $ne: null },
          status: { $in: [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IN_PROGRESS] },
        },
      },
      {
        $group: {
          _id: "$assigneeId",
          open: {
            $sum: { $cond: [{ $eq: ["$status", INCIDENT_STATUS.OPEN] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ["$status", INCIDENT_STATUS.IN_PROGRESS] }, 1, 0] },
          },
          totalUnresolved: { $sum: 1 },
        },
      },
    ]);

    const workloadMap = new Map<string, { open: number; inProgress: number; totalUnresolved: number }>();
    for (const item of workloadAgg) {
      workloadMap.set(item._id.toString(), {
        open: item.open,
        inProgress: item.inProgress,
        totalUnresolved: item.totalUnresolved,
      });
    }

    // 3. Assemble complete list with safe display information
    return members.map((member) => {
      const stats = workloadMap.get(member._id.toString()) || {
        open: 0,
        inProgress: 0,
        totalUnresolved: 0,
      };

      return {
        member: {
          id: member._id.toString(),
          name: member.name,
          email: member.email,
          role: member.role,
        },
        open: stats.open,
        inProgress: stats.inProgress,
        totalUnresolved: stats.totalUnresolved,
      };
    });
  }
}

export const dashboardDao = new DashboardDao();
export default dashboardDao;

