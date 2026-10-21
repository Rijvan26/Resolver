import { Types } from "mongoose";
import { activityDao, ActivityPaginationOptions } from "../dao/activityDao";
import { incidentDao } from "../dao/incidentDao";
import { IActivity } from "../models/Activity";
import { ActivityAction, Role } from "../types";
import { NotFoundError } from "../utils/errors";
import { ListTimelineQueryInput } from "../validations/activityValidation";
import { UserSummary } from "./incidentService";

export interface SafeActivityDetails {
  id: string;
  incidentId: string;
  organizationId: string;
  actor: UserSummary;
  action: ActivityAction;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface PaginatedTimelineResult {
  timeline: SafeActivityDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Format a Mongoose activity document into a safe API response.
 */
const formatActivity = (doc: IActivity): SafeActivityDetails => {
  const populatedActor = doc.actorId as unknown as {
    _id?: Types.ObjectId;
    name?: string;
    email?: string;
    role?: Role;
  };

  const actorFormatted: UserSummary = populatedActor?._id
    ? {
        id: populatedActor._id.toString(),
        name: populatedActor.name || "",
        email: populatedActor.email || "",
        role: populatedActor.role || ("DEVELOPER" as Role),
      }
    : {
        id: doc.actorId.toString(),
        name: "",
        email: "",
        role: "DEVELOPER" as Role,
      };

  return {
    id: doc._id.toString(),
    incidentId: doc.incidentId.toString(),
    organizationId: doc.organizationId.toString(),
    actor: actorFormatted,
    action: doc.action,
    metadata: doc.metadata,
    createdAt: doc.createdAt,
  };
};

export class ActivityService {
  /**
   * Retrieve the audit/activity timeline for an incident scoped to organization.
   */
  async getIncidentTimeline(
    organizationId: string,
    incidentId: string,
    query: ListTimelineQueryInput
  ): Promise<PaginatedTimelineResult> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found in organization");
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const options: ActivityPaginationOptions = {
      skip,
      limit,
      sortOrder: query.sortOrder || "desc",
      action: query.action,
    };

    const [docs, total] = await Promise.all([
      activityDao.findActivitiesByIncident(organizationId, incidentId, options),
      activityDao.countActivitiesByIncident(organizationId, incidentId, options),
    ]);

    const timeline = docs.map(formatActivity);

    return {
      timeline,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export const activityService = new ActivityService();
export default activityService;
