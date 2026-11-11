import { Types, ClientSession } from "mongoose";
import { Runbook, IRunbook } from "../models/Runbook";

export class RunbookDao {
  /**
   * Create and persist a new runbook entry.
   */
  async create(data: Partial<IRunbook>, session?: ClientSession): Promise<IRunbook> {
    const runbook = new Runbook(data);
    return await runbook.save({ session });
  }

  /**
   * Find a runbook by ID.
   */
  async findById(id: string | Types.ObjectId): Promise<IRunbook | null> {
    return await Runbook.findById(id).populate("serviceId", "name tier").exec();
  }

  /**
   * Find all runbooks for an organization.
   */
  async findByOrg(organizationId: string | Types.ObjectId): Promise<IRunbook[]> {
    return await Runbook.find({ organizationId })
      .populate("serviceId", "name tier")
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find runbooks for a specific service within an organization.
   */
  async findByService(
    organizationId: string | Types.ObjectId,
    serviceId: string | Types.ObjectId
  ): Promise<IRunbook[]> {
    return await Runbook.find({ organizationId, serviceId })
      .populate("serviceId", "name tier")
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Delete a runbook scoped to an organization.
   */
  async deleteByOrgAndId(
    organizationId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<boolean> {
    const result = await Runbook.findOneAndDelete(
      { _id: id, organizationId },
      { session }
    ).exec();
    return result !== null;
  }
}

export const runbookDao = new RunbookDao();
export default runbookDao;

