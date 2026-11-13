import mongoose, { ClientSession, Types } from "mongoose";
import { organizationDao } from "../dao/organizationDao";
import { userDao } from "../dao/userDao";
import { isTransactionSupported } from "../config/db";
import {
  ROLES,
  Role,
  MEMBER_ROLE_ASSIGNMENT_PERMISSIONS,
  MEMBER_MODIFICATION_TARGET_PERMISSIONS,
  OrganizationAiSettings,
} from "../types";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  AuthenticationError,
  ValidationError,
} from "../utils/errors";
import {
  UpdateOrganizationInput,
  ListMembersQueryInput,
} from "../validations/organizationValidation";
import { comparePassword } from "../utils/passwordUtils";
import { organizationDeletionAuditDao } from "../dao/organizationDeletionAuditDao";
import { User } from "../models/User";
import { Incident } from "../models/Incident";
import { Service } from "../models/Service";
import { Alert } from "../models/Alert";
import { Comment } from "../models/Comment";
import { Activity } from "../models/Activity";
import { Invitation } from "../models/Invitation";
import { Notification } from "../models/Notification";
import { Runbook } from "../models/Runbook";
import { AiSuggestion } from "../models/AiSuggestion";
import { IncidentEmbedding } from "../models/IncidentEmbedding";
import { RefreshToken } from "../models/RefreshToken";
import { Organization } from "../models/Organization";
import { getAiQueue, getEmbedQueue } from "./ai/queue/bullmq";

export interface SafeOrganizationDetails {
  id: string;
  name: string;
  slug: string;
  statusPageEnabled: boolean;
  aiSettings?: OrganizationAiSettings;
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
      aiSettings: org.aiSettings || {
        alertGrouping: true,
        runbooks: true,
        assistant: true,
        alertGroupingWindowMinutes: 30,
        alertGroupingSimilarityThreshold: 0.82,
      },
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
    const existing = await organizationDao.findById(organizationId);
    if (!existing) {
      throw new NotFoundError("Organization not found");
    }

    const mergedAiSettings = input.aiSettings
      ? {
          ...(existing.aiSettings || {
            alertGrouping: true,
            runbooks: true,
            assistant: true,
            alertGroupingWindowMinutes: 30,
            alertGroupingSimilarityThreshold: 0.82,
          }),
          ...input.aiSettings,
        }
      : undefined;

    const updated = await organizationDao.updateById(organizationId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.statusPageEnabled !== undefined ? { statusPageEnabled: input.statusPageEnabled } : {}),
      ...(mergedAiSettings !== undefined ? { aiSettings: mergedAiSettings } : {}),
    });

    if (!updated) {
      throw new NotFoundError("Organization not found");
    }

    return {
      id: updated._id.toString(),
      name: updated.name,
      slug: updated.slug,
      statusPageEnabled: updated.statusPageEnabled,
      aiSettings: updated.aiSettings,
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

  /**
   * Dry-run preview of organization deletion returning document counts per collection.
   * Counts only, zero personal data.
   */
  async getDeletePreview(
    callerUserId: string,
    targetOrgIdOrMe: string
  ): Promise<OrganizationDeletePreview> {
    const caller = await User.findById(callerUserId);
    if (!caller) {
      throw new AuthenticationError("User account no longer exists");
    }
    if (caller.role !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Only Super Admins are permitted to view organization deletion preview");
    }

    const targetOrgId = targetOrgIdOrMe === "me" ? caller.organizationId.toString() : targetOrgIdOrMe;
    if (!Types.ObjectId.isValid(targetOrgId)) {
      throw new ValidationError("Invalid organization ID format");
    }

    const org = await Organization.findById(targetOrgId);
    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    const orgObjectId = org._id;

    const [
      membersCount,
      incidentsCount,
      servicesCount,
      alertsCount,
      commentsCount,
      activitiesCount,
      invitationsCount,
      notificationsCount,
      runbooksCount,
      aiSuggestionsCount,
      embeddingsCount,
      refreshTokensCount,
    ] = await Promise.all([
      User.countDocuments({ organizationId: orgObjectId }),
      Incident.countDocuments({ organizationId: orgObjectId }),
      Service.countDocuments({ organizationId: orgObjectId }),
      Alert.countDocuments({ organizationId: orgObjectId }),
      Comment.countDocuments({ organizationId: orgObjectId }),
      Activity.countDocuments({ organizationId: orgObjectId }),
      Invitation.countDocuments({ organizationId: orgObjectId }),
      Notification.countDocuments({ organizationId: orgObjectId }),
      Runbook.countDocuments({ organizationId: orgObjectId }),
      AiSuggestion.countDocuments({ organizationId: orgObjectId }),
      IncidentEmbedding.countDocuments({ organizationId: orgObjectId }),
      RefreshToken.countDocuments({ organizationId: orgObjectId }),
    ]);

    const counts = {
      members: membersCount,
      incidents: incidentsCount,
      services: servicesCount,
      alerts: alertsCount,
      comments: commentsCount,
      activities: activitiesCount,
      invitations: invitationsCount,
      notifications: notificationsCount,
      runbooks: runbooksCount,
      aiSuggestions: aiSuggestionsCount,
      incidentEmbeddings: embeddingsCount,
      refreshTokens: refreshTokensCount,
    };

    const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

    return {
      organizationId: org._id.toString(),
      organizationName: org.name,
      organizationSlug: org.slug,
      counts,
      totalRecords,
    };
  }

  /**
   * Cascade delete organization and all associated data across collections.
   * Enforces server-side Super Admin authorization, password re-authentication,
   * exact name confirmation, platform lockout protection, BullMQ job cleanup,
   * and permanent audit logging.
   */
  async deleteOrganization(
    callerUserId: string,
    targetOrgIdOrMe: string,
    input: { organizationName: string; password: string }
  ): Promise<{ message: string; auditId: string; totalRecordsDeleted: number }> {
    // 1. Authenticate caller and verify Super Admin role
    const caller = await User.findById(callerUserId).select("+passwordHash");
    if (!caller) {
      throw new AuthenticationError("User account no longer exists");
    }
    if (caller.role !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Only Super Admins are permitted to delete an organization");
    }

    // 2. Re-authenticate: Verify superadmin password
    const isPasswordValid = await comparePassword(input.password, caller.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError("Invalid password. Re-authentication failed.");
    }

    // 3. Resolve target organization
    const targetOrgId = targetOrgIdOrMe === "me" ? caller.organizationId.toString() : targetOrgIdOrMe;
    if (!Types.ObjectId.isValid(targetOrgId)) {
      throw new ValidationError("Invalid organization ID format");
    }

    const org = await Organization.findById(targetOrgId);
    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    // 4. Verify confirmation: organizationName must match exactly
    if (input.organizationName.trim() !== org.name.trim()) {
      throw new ValidationError(
        `Organization name confirmation mismatch. Expected '${org.name}', received '${input.organizationName}'.`
      );
    }

    // 5. Prevent platform lockout:
    // If the superadmin's account belongs to the organization being deleted,
    // ensure there is at least one OTHER active superadmin in another organization
    // so the platform is not permanently locked out.
    if (caller.organizationId.toString() === targetOrgId) {
      const otherSuperAdminsCount = await User.countDocuments({
        organizationId: { $ne: org._id },
        role: ROLES.SUPER_ADMIN,
        isActive: true,
      });

      if (otherSuperAdminsCount === 0) {
        throw new ValidationError(
          "Cannot delete this organization: your Super Admin account belongs to it, and deleting it would leave no active Super Admins on the platform. Please ensure another active Super Admin exists in another organization before deleting."
        );
      }
    }

    const orgObjectId = org._id;

    // 6. Gather counts for audit record
    const [
      membersCount,
      incidentsCount,
      servicesCount,
      alertsCount,
      commentsCount,
      activitiesCount,
      invitationsCount,
      notificationsCount,
      runbooksCount,
      aiSuggestionsCount,
      embeddingsCount,
      refreshTokensCount,
    ] = await Promise.all([
      User.countDocuments({ organizationId: orgObjectId }),
      Incident.countDocuments({ organizationId: orgObjectId }),
      Service.countDocuments({ organizationId: orgObjectId }),
      Alert.countDocuments({ organizationId: orgObjectId }),
      Comment.countDocuments({ organizationId: orgObjectId }),
      Activity.countDocuments({ organizationId: orgObjectId }),
      Invitation.countDocuments({ organizationId: orgObjectId }),
      Notification.countDocuments({ organizationId: orgObjectId }),
      Runbook.countDocuments({ organizationId: orgObjectId }),
      AiSuggestion.countDocuments({ organizationId: orgObjectId }),
      IncidentEmbedding.countDocuments({ organizationId: orgObjectId }),
      RefreshToken.countDocuments({ organizationId: orgObjectId }),
    ]);

    const counts = {
      users: membersCount,
      incidents: incidentsCount,
      services: servicesCount,
      alerts: alertsCount,
      comments: commentsCount,
      activities: activitiesCount,
      invitations: invitationsCount,
      notifications: notificationsCount,
      runbooks: runbooksCount,
      aiSuggestions: aiSuggestionsCount,
      incidentEmbeddings: embeddingsCount,
      refreshTokens: refreshTokensCount,
      organizations: 1,
    };
    const totalRecordsDeleted = Object.values(counts).reduce((a, b) => a + b, 0);

    // 7. Perform cascade deletion (using transaction if available, else children first, org last)
    const supportsTx = isTransactionSupported();
    let auditRecordId: string = "";

    if (supportsTx) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await Promise.all([
            Activity.deleteMany({ organizationId: orgObjectId }, { session }),
            AiSuggestion.deleteMany({ organizationId: orgObjectId }, { session }),
            Alert.deleteMany({ organizationId: orgObjectId }, { session }),
            Comment.deleteMany({ organizationId: orgObjectId }, { session }),
            Incident.deleteMany({ organizationId: orgObjectId }, { session }),
            IncidentEmbedding.deleteMany({ organizationId: orgObjectId }, { session }),
            Invitation.deleteMany({ organizationId: orgObjectId }, { session }),
            Notification.deleteMany({ organizationId: orgObjectId }, { session }),
            RefreshToken.deleteMany({ organizationId: orgObjectId }, { session }),
            Runbook.deleteMany({ organizationId: orgObjectId }, { session }),
            Service.deleteMany({ organizationId: orgObjectId }, { session }),
            User.deleteMany({ organizationId: orgObjectId }, { session }),
          ]);

          await Organization.deleteOne({ _id: orgObjectId }, { session });

          const audit = await organizationDeletionAuditDao.create(
            {
              organizationId: orgObjectId,
              organizationName: org.name,
              organizationSlug: org.slug,
              deletedBy: {
                userId: caller._id,
                email: caller.email,
              },
              counts,
              totalRecordsDeleted,
            },
            session
          );
          auditRecordId = audit._id.toString();
        });
      } finally {
        await session.endSession();
      }
    } else {
      // Non-transactional fallback (idempotent, children first, organization last)
      await Promise.all([
        Activity.deleteMany({ organizationId: orgObjectId }),
        AiSuggestion.deleteMany({ organizationId: orgObjectId }),
        Alert.deleteMany({ organizationId: orgObjectId }),
        Comment.deleteMany({ organizationId: orgObjectId }),
        Incident.deleteMany({ organizationId: orgObjectId }),
        IncidentEmbedding.deleteMany({ organizationId: orgObjectId }),
        Invitation.deleteMany({ organizationId: orgObjectId }),
        Notification.deleteMany({ organizationId: orgObjectId }),
        RefreshToken.deleteMany({ organizationId: orgObjectId }),
        Runbook.deleteMany({ organizationId: orgObjectId }),
        Service.deleteMany({ organizationId: orgObjectId }),
        User.deleteMany({ organizationId: orgObjectId }),
      ]);

      await Organization.deleteOne({ _id: orgObjectId });

      const audit = await organizationDeletionAuditDao.create({
        organizationId: orgObjectId,
        organizationName: org.name,
        organizationSlug: org.slug,
        deletedBy: {
          userId: caller._id,
          email: caller.email,
        },
        counts,
        totalRecordsDeleted,
      });
      auditRecordId = audit._id.toString();
    }

    // 8. Clean up pending BullMQ jobs (fail-open)
    try {
      const aiQueue = getAiQueue();
      const embedQueue = getEmbedQueue();
      const cleanQueue = async (q: any) => {
        try {
          const jobs = await q.getJobs(["waiting", "delayed", "prioritized"]);
          for (const job of jobs) {
            if (job?.data?.organizationId === targetOrgId) {
              await job.remove().catch(() => {});
            }
          }
        } catch {
          // fail-open
        }
      };
      await Promise.allSettled([cleanQueue(aiQueue), cleanQueue(embedQueue)]);
    } catch {
      // fail-open
    }

    return {
      message: `Organization '${org.name}' and all associated resources have been permanently deleted.`,
      auditId: auditRecordId,
      totalRecordsDeleted,
    };
  }
}

export interface OrganizationDeletePreview {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  counts: {
    members: number;
    incidents: number;
    services: number;
    alerts: number;
    comments: number;
    activities: number;
    invitations: number;
    notifications: number;
    runbooks: number;
    aiSuggestions: number;
    incidentEmbeddings: number;
    refreshTokens: number;
  };
  totalRecords: number;
}

export const organizationService = new OrganizationService();
export default organizationService;
