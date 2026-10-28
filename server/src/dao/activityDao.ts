import { ClientSession, Types } from "mongoose";
import { Activity, IActivity } from "../models/Activity";
import { ActivityAction } from "../types";

export interface CreateActivityDaoInput {
  organizationId: Types.ObjectId | string;
  incidentId: Types.ObjectId | string;
  actorId: Types.ObjectId | string;
  action: ActivityAction;
  metadata?: Record<string, unknown>;
}

export interface ActivityPaginationOptions {
  skip?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
  action?: ActivityAction;
}

export class ActivityDao {
  /**
   * Create a new immutable audit/activity entry.
   */
  async create(data: CreateActivityDaoInput, session?: ClientSession): Promise<IActivity> {
    const activity = new Activity({
      organizationId: data.organizationId,
      incidentId: data.incidentId,
      actorId: data.actorId,
      action: data.action,
      metadata: data.metadata || {},
    });

    return await activity.save({ session });
  }

  /**
   * Find activities for an incident scoped to organization.
   */
  async findActivitiesByIncident(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId,
    options: ActivityPaginationOptions = {}
  ): Promise<IActivity[]> {
    const query: Record<string, unknown> = {
      organizationId,
      incidentId,
    };

    if (options.action) {
      query.action = options.action;
    }

    const sortDirection = options.sortOrder === "asc" ? 1 : -1;

    let cursor = Activity.find(query)
      .sort({ createdAt: sortDirection, _id: sortDirection })
      .populate("actorId", "name email role");

    if (options.skip !== undefined) {
      cursor = cursor.skip(options.skip);
    }
    if (options.limit !== undefined) {
      cursor = cursor.limit(options.limit);
    }

    return await cursor.exec();
  }

  /**
   * Count activities matching options for an incident scoped to organization.
   */
  async countActivitiesByIncident(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId,
    options: ActivityPaginationOptions = {}
  ): Promise<number> {
    const query: Record<string, unknown> = {
      organizationId,
      incidentId,
    };

    if (options.action) {
      query.action = options.action;
    }

    return await Activity.countDocuments(query).exec();
  }

  /**
   * Find recent activities across an entire organization with populated actor and incident details.
   */
  async findRecentActivitiesByOrg(
    organizationId: string | Types.ObjectId,
    options: { skip?: number; limit?: number } = {}
  ): Promise<IActivity[]> {
    let cursor = Activity.find({ organizationId })
      .sort({ createdAt: -1, _id: -1 })
      .populate("actorId", "name email role")
      .populate("incidentId", "title status priority");

    if (options.skip !== undefined) {
      cursor = cursor.skip(options.skip);
    }
    if (options.limit !== undefined) {
      cursor = cursor.limit(options.limit);
    }

    return await cursor.exec();
  }

  /**
   * Count total activities across an organization.
   */
  async countActivitiesByOrg(organizationId: string | Types.ObjectId): Promise<number> {
    return await Activity.countDocuments({ organizationId }).exec();
  }
}

export const activityDao = new ActivityDao();
export default activityDao;
