import mongoose, { ClientSession, Types } from "mongoose";
import { organizationDao } from "../dao/organizationDao";
import { userDao } from "../dao/userDao";
import { isTransactionSupported } from "../config/db";
import {
  ROLES,
  Role,
  MEMBER_ROLE_ASSIGNMENT_PERMISSIONS,
  MEMBER_MODIFICATION_TARGET_PERMISSIONS,
} from "../types";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../utils/errors";
import {
  UpdateOrganizationInput,
  ListMembersQueryInput,
} from "../validations/organizationValidation";

export interface SafeOrganizationDetails {
  id: string;
  name: string;
  slug: string;
  statusPageEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeMemberDetails {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedMembersResult {
  members: SafeMemberDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class OrganizationService {
  /**
   * Get authenticated user's organization profile.
   */
  async getOrganization(organizationId: string): Promise<SafeOrganizationDetails> {
    const org = await organizationDao.findById(organizationId);
    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    return {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      statusPageEnabled: org.statusPageEnabled,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }

  /**
   * Update organization settings (only explicitly authorized fields).
   */
  async updateOrganization(
    organizationId: string,
    input: UpdateOrganizationInput
  ): Promise<SafeOrganizationDetails> {
    const updated = await organizationDao.updateById(organizationId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.statusPageEnabled !== undefined ? { statusPageEnabled: input.statusPageEnabled } : {}),
    });

    if (!updated) {
      throw new NotFoundError("Organization not found");
    }

    return {
      id: updated._id.toString(),
      name: updated.name,
      slug: updated.slug,
      statusPageEnabled: updated.statusPageEnabled,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * List organization members with pagination, search, and filtering.
   */
  async listMembers(
    organizationId: string,
    query: ListMembersQueryInput
  ): Promise<PaginatedMembersResult> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const isActive =
      query.status === "active"
        ? true
        : query.status === "deactivated"
        ? false
        : undefined;

    const filter = {
      ...(query.role ? { role: query.role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(query.search ? { search: query.search } : {}),
    };

    const [members, total] = await Promise.all([
      userDao.findMembersByOrg(organizationId, filter, { skip, limit }),
      userDao.countMembersByOrg(organizationId, filter),
    ]);

    const safeMembers: SafeMemberDetails[] = members.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId.toString(),
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return {
      members: safeMembers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single member details scoped to the caller's organization.
   */
  async getMember(organizationId: string, memberId: string): Promise<SafeMemberDetails> {
    const user = await userDao.findByOrgAndId(organizationId, memberId);
    if (!user) {
      throw new NotFoundError("Member not found in organization");
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId.toString(),
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Update a member's role with privilege escalation guards and Super Admin preservation.
   */
  async updateMemberRole(
    organizationId: string,
    actorUserId: string,
    actorRole: Role,
    targetMemberId: string,
    newRole: Role
  ): Promise<SafeMemberDetails> {
    // 1. Guard against self-role changes through administrative endpoint
    if (actorUserId === targetMemberId) {
      throw new ForbiddenError("Users are not permitted to modify their own role");
    }

    // 2. Fetch target member scoped to organization
    const target = await userDao.findByOrgAndId(organizationId, targetMemberId);
    if (!target) {
      throw new NotFoundError("Member not found in organization");
    }

    // 3. Verify actor has permission to modify a member with the target's current role
    const allowedTargets = MEMBER_MODIFICATION_TARGET_PERMISSIONS[actorRole] || [];
    if (!allowedTargets.includes(target.role)) {
      throw new ForbiddenError(
        `Your role (${actorRole}) does not have permission to modify members with role ${target.role}`
      );
    }

    // 4. Verify actor has permission to assign the requested new role (privilege escalation guard)
    const allowedAssignments = MEMBER_ROLE_ASSIGNMENT_PERMISSIONS[actorRole] || [];
    if (!allowedAssignments.includes(newRole)) {
      throw new ForbiddenError(
        `Your role (${actorRole}) does not have permission to assign role ${newRole}`
      );
    }

    // 5. Guard against removing/demoting the organization's only Super Admin
    if (target.role === ROLES.SUPER_ADMIN && newRole !== ROLES.SUPER_ADMIN) {
      const activeSuperAdmins = await userDao.countActiveSuperAdmins(organizationId);
      if (activeSuperAdmins <= 1) {
        throw new ConflictError("Cannot demote the organization's only active Super Admin");
      }
    }

    // 6. Execute update with transaction if supported
    const supportsTx = isTransactionSupported();
    let session: ClientSession | null = null;

    if (supportsTx) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    try {
      if (session) {
        // Atomic verification within transaction
        if (target.role === ROLES.SUPER_ADMIN && newRole !== ROLES.SUPER_ADMIN) {
          const count = await userDao.countActiveSuperAdmins(organizationId, session);
          if (count <= 1) {
            throw new ConflictError("Cannot demote the organization's only active Super Admin");
          }
        }
      }

      const updated = await userDao.updateById(
        targetMemberId,
        { role: newRole },
        session || undefined
      );

      if (session) {
        await session.commitTransaction();
      }

      if (!updated) {
        throw new NotFoundError("Member not found in organization");
      }

      return {
        id: updated._id.toString(),
        name: updated.name,
        email: updated.email,
        role: updated.role,
        organizationId: updated.organizationId.toString(),
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (error) {
      if (session) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }

  /**
   * Update a member's active status (activate/deactivate).
   */
  async updateMemberStatus(
    organizationId: string,
    actorUserId: string,
    actorRole: Role,
    targetMemberId: string,
    isActive: boolean
  ): Promise<SafeMemberDetails> {
    // 1. Guard against self-deactivation through administrative endpoint
    if (actorUserId === targetMemberId) {
      throw new ForbiddenError("Users are not permitted to deactivate or activate their own account");
    }

    // 2. Fetch target member scoped to organization
    const target = await userDao.findByOrgAndId(organizationId, targetMemberId);
    if (!target) {
      throw new NotFoundError("Member not found in organization");
    }

    // 3. Verify actor has permission to modify this target's status
    const allowedTargets = MEMBER_MODIFICATION_TARGET_PERMISSIONS[actorRole] || [];
    if (!allowedTargets.includes(target.role)) {
      throw new ForbiddenError(
        `Your role (${actorRole}) does not have permission to modify status of members with role ${target.role}`
      );
    }

    // 4. Guard against deactivating the organization's only Super Admin
    if (target.role === ROLES.SUPER_ADMIN && !isActive) {
      const activeSuperAdmins = await userDao.countActiveSuperAdmins(organizationId);
      if (activeSuperAdmins <= 1) {
        throw new ConflictError("Cannot deactivate the organization's only active Super Admin");
      }
    }

    // 5. Execute update with transaction if supported
    const supportsTx = isTransactionSupported();
    let session: ClientSession | null = null;

    if (supportsTx) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    try {
      if (session) {
        if (target.role === ROLES.SUPER_ADMIN && !isActive) {
          const count = await userDao.countActiveSuperAdmins(organizationId, session);
          if (count <= 1) {
            throw new ConflictError("Cannot deactivate the organization's only active Super Admin");
          }
        }
      }

      const updated = await userDao.updateById(
        targetMemberId,
        { isActive },
        session || undefined
      );

      if (session) {
        await session.commitTransaction();
      }

      if (!updated) {
        throw new NotFoundError("Member not found in organization");
      }

      return {
        id: updated._id.toString(),
        name: updated.name,
        email: updated.email,
        role: updated.role,
        organizationId: updated.organizationId.toString(),
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (error) {
      if (session) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }
}

export const organizationService = new OrganizationService();
export default organizationService;
