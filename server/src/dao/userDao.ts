import { ClientSession, Types } from "mongoose";
import { User, IUser } from "../models/User";
import { Role } from "../types";

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  organizationId: Types.ObjectId | string;
  isActive?: boolean;
}

export interface FindMembersFilter {
  role?: Role;
  isActive?: boolean;
}

export interface PaginationOptions {
  skip?: number;
  limit?: number;
}

export class UserDao {
  /**
   * Create a new user.
   */
  async create(data: CreateUserInput, session?: ClientSession): Promise<IUser> {
    const user = new User({
      ...data,
      email: data.email.toLowerCase().trim(),
    });
    return await user.save({ session });
  }

  /**
   * Find a user by ID (excludes passwordHash by default).
   */
  async findById(id: string | Types.ObjectId): Promise<IUser | null> {
    return await User.findById(id).exec();
  }

  /**
   * Find a user by normalized email.
   * If includePassword is true, explicitly selects passwordHash for authentication checks.
   */
  async findByEmail(email: string, includePassword = false): Promise<IUser | null> {
    const query = User.findOne({ email: email.toLowerCase().trim() });
    if (includePassword) {
      query.select("+passwordHash");
    }
    return await query.exec();
  }

  /**
   * Find a user within a specific organization scope.
   */
  async findByOrgAndId(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId
  ): Promise<IUser | null> {
    return await User.findOne({ _id: userId, organizationId }).exec();
  }

  /**
   * List members belonging to an organization with optional filtering and pagination.
   */
  async findMembersByOrg(
    organizationId: string | Types.ObjectId,
    filter: FindMembersFilter = {},
    options: PaginationOptions = {}
  ): Promise<IUser[]> {
    const query: Record<string, unknown> = { organizationId };

    if (filter.role) {
      query.role = filter.role;
    }
    if (filter.isActive !== undefined) {
      query.isActive = filter.isActive;
    }

    let cursor = User.find(query).sort({ createdAt: -1 });

    if (options.skip !== undefined) {
      cursor = cursor.skip(options.skip);
    }
    if (options.limit !== undefined) {
      cursor = cursor.limit(options.limit);
    }

    return await cursor.exec();
  }

  /**
   * Count members in an organization.
   */
  async countMembersByOrg(
    organizationId: string | Types.ObjectId,
    filter: FindMembersFilter = {}
  ): Promise<number> {
    const query: Record<string, unknown> = { organizationId };

    if (filter.role) {
      query.role = filter.role;
    }
    if (filter.isActive !== undefined) {
      query.isActive = filter.isActive;
    }

    return await User.countDocuments(query).exec();
  }

  /**
   * Update a user's details.
   */
  async updateById(
    id: string | Types.ObjectId,
    update: Partial<IUser>,
    session?: ClientSession
  ): Promise<IUser | null> {
    return await User.findByIdAndUpdate(id, { $set: update }, { returnDocument: "after", session }).exec();
  }

  /**
   * Delete a user by ID (used for compensating rollbacks).
   */
  async deleteById(id: string | Types.ObjectId, session?: ClientSession): Promise<boolean> {
    const result = await User.findByIdAndDelete(id, { session }).exec();
    return result !== null;
  }
}

export const userDao = new UserDao();
export default userDao;
