import { ClientSession, Types } from "mongoose";
import { Organization, IOrganization } from "../models/Organization";

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  statusPageEnabled?: boolean;
}

export class OrganizationDao {
  /**
   * Create a new organization record.
   */
  async create(
    data: CreateOrganizationInput,
    session?: ClientSession
  ): Promise<IOrganization> {
    const org = new Organization(data);
    return await org.save({ session });
  }

  /**
   * Find an organization by its ID.
   */
  async findById(id: string | Types.ObjectId): Promise<IOrganization | null> {
    return await Organization.findById(id).exec();
  }

  /**
   * Find an organization by its unique slug.
   */
  async findBySlug(slug: string): Promise<IOrganization | null> {
    return await Organization.findOne({ slug: slug.toLowerCase().trim() }).exec();
  }

  /**
   * Check whether an organization with the given slug already exists.
   */
  async existsBySlug(slug: string): Promise<boolean> {
    const count = await Organization.countDocuments({ slug: slug.toLowerCase().trim() }).exec();
    return count > 0;
  }

  /**
   * Update an organization by its ID.
   */
  async updateById(
    id: string | Types.ObjectId,
    update: Partial<IOrganization>,
    session?: ClientSession
  ): Promise<IOrganization | null> {
    return await Organization.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: "after", session }
    ).exec();
  }

  /**
   * Delete an organization by ID (used for compensating rollbacks).
   */
  async deleteById(id: string | Types.ObjectId, session?: ClientSession): Promise<boolean> {
    const result = await Organization.findByIdAndDelete(id, { session }).exec();
    return result !== null;
  }
}

export const organizationDao = new OrganizationDao();
export default organizationDao;
