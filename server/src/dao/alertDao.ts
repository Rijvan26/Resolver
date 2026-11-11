import { ClientSession, Types } from "mongoose";
import { Alert, IAlert } from "../models/Alert";
import { ALERT_STATUS } from "../types";

export class AlertDao {
  /**
   * Create and persist a new alert.
   */
  async create(data: Partial<IAlert>, session?: ClientSession): Promise<IAlert> {
    const alert = new Alert(data);
    return await alert.save({ session });
  }

  /**
   * Find an alert by ID.
   */
  async findById(id: string | Types.ObjectId): Promise<IAlert | null> {
    return await Alert.findById(id).populate("serviceId", "name tier owningTeam").exec();
  }

  /**
   * Find an alert scoped to an organization.
   */
  async findByOrgAndId(
    organizationId: string | Types.ObjectId,
    id: string | Types.ObjectId
  ): Promise<IAlert | null> {
    return await Alert.findOne({ _id: id, organizationId })
      .populate("serviceId", "name tier owningTeam")
      .exec();
  }

  /**
   * Find the most recent alert matching an exact fingerprint within an organization since a cutoff date.
   */
  async findRecentByFingerprint(
    organizationId: string | Types.ObjectId,
    fingerprint: string,
    since: Date
  ): Promise<IAlert | null> {
    return await Alert.findOne({
      organizationId,
      fingerprint,
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .populate("serviceId", "name tier owningTeam")
      .exec();
  }

  /**
   * Find all alerts attached to an incident.
   */
  async findAlertsByIncident(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId
  ): Promise<IAlert[]> {
    return await Alert.find({
      organizationId,
      incidentId,
      status: ALERT_STATUS.GROUPED,
    })
      .sort({ createdAt: -1 })
      .populate("serviceId", "name tier owningTeam")
      .exec();
  }

  /**
   * Find alerts suggested for grouping into an incident (pending human decision).
   */
  async findSuggestedAlertsByIncident(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId
  ): Promise<IAlert[]> {
    return await Alert.find({
      organizationId,
      suggestedIncidentId: incidentId,
      status: ALERT_STATUS.OPEN,
    })
      .sort({ createdAt: -1 })
      .populate("serviceId", "name tier owningTeam")
      .exec();
  }

  /**
   * Count alerts attached to an incident.
   */
  async countByIncident(
    organizationId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId
  ): Promise<number> {
    return await Alert.countDocuments({
      organizationId,
      incidentId,
      status: ALERT_STATUS.GROUPED,
    }).exec();
  }

  /**
   * Update an alert by ID.
   */
  async update(
    id: string | Types.ObjectId,
    updates: Partial<IAlert>,
    session?: ClientSession
  ): Promise<IAlert | null> {
    return await Alert.findByIdAndUpdate(
      id,
      { $set: updates },
      { returnDocument: "after", session }
    ).exec();
  }
}

export const alertDao = new AlertDao();
export default alertDao;

