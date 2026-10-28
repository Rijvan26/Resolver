import { ClientSession, Types } from "mongoose";
import { Incident, IIncident } from "../models/Incident";
import { IncidentPriority, IncidentStatus } from "../types";

export interface CreateIncidentDaoInput {
  title: string;
  description: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  organizationId: Types.ObjectId | string;
  createdBy: Types.ObjectId | string;
  assigneeId?: Types.ObjectId | string | null;
  resolvedAt?: Date | null;
}

export interface FindIncidentsFilter {
  status?: IncidentStatus;
  priority?: IncidentPriority;
  assigneeId?: Types.ObjectId | string;
  search?: string;
}

export interface IncidentPaginationOptions {
  skip?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export class IncidentDao {
  /**
   * Create a new incident.
   */
  async create(data: CreateIncidentDaoInput, session?: ClientSession): Promise<IIncident> {
    const incident = new Incident({
      ...data,
      title: data.title.trim(),
      description: data.description.trim(),
    });
    return await incident.save({ session });
  }

  /**
   * Find an incident by ID scoped to a specific organization.
   * Populates creator and assignee safe profile details.
   */
  async findByOrgAndId(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId
  ): Promise<IIncident | null> {
    return await Incident.findOne({ _id: incidentId, organizationId })
      .populate("createdBy", "name email role")
      .populate("assigneeId", "name email role isActive")
      .exec();
  }

  /**
   * List incidents scoped to an organization with filtering, pagination, search, and sorting.
   */
  async findIncidentsByOrg(
    organizationId: string | Types.ObjectId,
    filter: FindIncidentsFilter = {},
    options: IncidentPaginationOptions = {}
  ): Promise<IIncident[]> {
    const query: Record<string, unknown> = { organizationId };

    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.priority) {
      query.priority = filter.priority;
    }
    if (filter.assigneeId) {
      query.assigneeId = filter.assigneeId;
    }
    if (filter.search && filter.search.trim().length > 0) {
      const sanitized = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(sanitized, "i");
      query.$or = [{ title: regex }, { description: regex }];
    }

    const sortField = options.sortBy || "createdAt";
    const sortDirection = options.sortOrder === "asc" ? 1 : -1;

    let cursor = Incident.find(query)
      .sort({ [sortField]: sortDirection })
      .populate("createdBy", "name email role")
      .populate("assigneeId", "name email role isActive");

    if (options.skip !== undefined) {
      cursor = cursor.skip(options.skip);
    }
    if (options.limit !== undefined) {
      cursor = cursor.limit(options.limit);
    }

    return await cursor.exec();
  }

  /**
   * Count incidents matching the filter in an organization.
   */
  async countIncidentsByOrg(
    organizationId: string | Types.ObjectId,
    filter: FindIncidentsFilter = {}
  ): Promise<number> {
    const query: Record<string, unknown> = { organizationId };

    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.priority) {
      query.priority = filter.priority;
    }
    if (filter.assigneeId) {
      query.assigneeId = filter.assigneeId;
    }
    if (filter.search && filter.search.trim().length > 0) {
      const sanitized = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(sanitized, "i");
      query.$or = [{ title: regex }, { description: regex }];
    }

    return await Incident.countDocuments(query).exec();
  }

  /**
   * Atomically update an incident scoped to an organization.
   */
  async updateByOrgAndId(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId,
    update: Partial<IIncident> | Record<string, unknown>,
    session?: ClientSession
  ): Promise<IIncident | null> {
    return await Incident.findOneAndUpdate(
      { _id: incidentId, organizationId },
      { $set: update },
      { returnDocument: "after", session }
    )
      .populate("createdBy", "name email role")
      .populate("assigneeId", "name email role isActive")
      .exec();
  }

  /**
   * Delete an incident scoped to an organization.
   */
  async deleteByOrgAndId(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<boolean> {
    const result = await Incident.findOneAndDelete(
      { _id: incidentId, organizationId },
      { session }
    ).exec();

    return result !== null;
  }
}

export const incidentDao = new IncidentDao();
export default incidentDao;
