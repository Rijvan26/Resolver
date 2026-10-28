import { dashboardDao, OverviewStats, DailyTrendEntry, TeamMemberWorkload } from "../dao/dashboardDao";
import { activityDao } from "../dao/activityDao";
import { DateRangeQueryInput, RecentActivityQueryInput } from "../validations/dashboardValidation";
import { IncidentPriority, IncidentStatus, Role } from "../types";

export interface PaginatedRecentActivity {
  activities: Array<{
    id: string;
    action: string;
    actor: {
      id: string;
      name: string;
      email: string;
      role?: Role;
    };
    incident?: {
      id: string;
      title: string;
      status: IncidentStatus;
      priority: IncidentPriority;
    } | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class DashboardService {
  /**
   * Helper to normalize a date to UTC start-of-day (00:00:00.000Z).
   */
  private normalizeStartOfDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Helper to normalize a date to UTC end-of-day (23:59:59.999Z).
   */
  private normalizeEndOfDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
  }

  /**
   * Generate an array of YYYY-MM-DD date strings between start and end inclusive.
   */
  private generateDateSeries(start: Date, end: Date): string[] {
    const dates: string[] = [];
    const current = new Date(start);
    current.setUTCHours(0, 0, 0, 0);

    const stop = new Date(end);
    stop.setUTCHours(0, 0, 0, 0);

    while (current <= stop) {
      dates.push(current.toISOString().split("T")[0]);
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  /**
   * Retrieve high-level overview metrics for an organization.
   */
  async getOverview(organizationId: string, query: DateRangeQueryInput): Promise<OverviewStats> {
    const start = query.startDate ? this.normalizeStartOfDay(query.startDate) : undefined;
    const end = query.endDate ? this.normalizeEndOfDay(query.endDate) : undefined;

    return await dashboardDao.getOverview(organizationId, start, end);
  }

  /**
   * Retrieve incident distribution by status.
   */
  async getIncidentsByStatus(
    organizationId: string,
    query: DateRangeQueryInput
  ): Promise<{ statusCounts: Record<IncidentStatus, number>; total: number }> {
    const start = query.startDate ? this.normalizeStartOfDay(query.startDate) : undefined;
    const end = query.endDate ? this.normalizeEndOfDay(query.endDate) : undefined;

    const distribution = await dashboardDao.getStatusDistribution(organizationId, start, end);
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);

    return { statusCounts: distribution, total };
  }

  /**
   * Retrieve incident distribution by priority.
   */
  async getIncidentsByPriority(
    organizationId: string,
    query: DateRangeQueryInput
  ): Promise<{ priorityCounts: Record<IncidentPriority, number>; total: number }> {
    const start = query.startDate ? this.normalizeStartOfDay(query.startDate) : undefined;
    const end = query.endDate ? this.normalizeEndOfDay(query.endDate) : undefined;

    const distribution = await dashboardDao.getPriorityDistribution(organizationId, start, end);
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);

    return { priorityCounts: distribution, total };
  }

  /**
   * Retrieve daily incident creation and resolution trends with gap-free date continuous series.
   */
  async getIncidentTrends(
    organizationId: string,
    query: DateRangeQueryInput
  ): Promise<{ trends: DailyTrendEntry[]; startDate: string; endDate: string }> {
    // Default to last 30 days if not provided
    const defaultEnd = new Date();
    const defaultStart = new Date();
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);

    const start = this.normalizeStartOfDay(query.startDate || defaultStart);
    const end = this.normalizeEndOfDay(query.endDate || defaultEnd);

    const { creations, resolutions } = await dashboardDao.getDailyTrends(
      organizationId,
      start,
      end
    );

    const dateKeys = this.generateDateSeries(start, end);

    const trends: DailyTrendEntry[] = dateKeys.map((dateStr) => ({
      date: dateStr,
      created: creations.get(dateStr) || 0,
      resolved: resolutions.get(dateStr) || 0,
    }));

    return {
      trends,
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }

  /**
   * Retrieve team workload per eligible member.
   */
  async getTeamWorkload(organizationId: string): Promise<{ teamWorkload: TeamMemberWorkload[]; totalMembers: number }> {
    const teamWorkload = await dashboardDao.getTeamWorkload(organizationId);
    return {
      teamWorkload,
      totalMembers: teamWorkload.length,
    };
  }

  /**
   * Retrieve paginated recent activity events across the organization.
   */
  async getRecentActivity(
    organizationId: string,
    query: RecentActivityQueryInput
  ): Promise<PaginatedRecentActivity> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [activities, total] = await Promise.all([
      activityDao.findRecentActivitiesByOrg(organizationId, { skip, limit }),
      activityDao.countActivitiesByOrg(organizationId),
    ]);

    const formatted = activities.map((item) => {
      const actor = item.actorId as unknown as {
        _id?: { toString(): string };
        name?: string;
        email?: string;
        role?: Role;
      };

      const incident = item.incidentId as unknown as {
        _id?: { toString(): string };
        title?: string;
        status?: IncidentStatus;
        priority?: IncidentPriority;
      } | null;

      return {
        id: item._id.toString(),
        action: item.action,
        actor: {
          id: actor?._id ? actor._id.toString() : String(item.actorId),
          name: actor?.name || "System",
          email: actor?.email || "",
          role: actor?.role,
        },
        incident: incident?._id
          ? {
              id: incident._id.toString(),
              title: incident.title || "",
              status: incident.status as IncidentStatus,
              priority: incident.priority as IncidentPriority,
            }
          : null,
        metadata: item.metadata || {},
        createdAt: item.createdAt,
      };
    });

    return {
      activities: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export const dashboardService = new DashboardService();
export default dashboardService;

