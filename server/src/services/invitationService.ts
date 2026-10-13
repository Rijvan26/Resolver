import mongoose, { Types, ClientSession } from "mongoose";
import { invitationDao } from "../dao/invitationDao";
import { userDao } from "../dao/userDao";
import { organizationDao } from "../dao/organizationDao";
import { Invitation } from "../models/Invitation";
import { isTransactionSupported } from "../config/db";
import { config } from "../config/config";
import {
  ROLES,
  Role,
  INVITATION_PERMISSIONS,
  INVITATION_STATUS,
  InvitationStatus,
} from "../types";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import { generateRandomToken, hashToken } from "../utils/tokenUtils";
import { hashPassword } from "../utils/passwordUtils";
import {
  CreateInvitationInput,
  AcceptInvitationInput,
} from "../validations/invitationValidation";
import { SafeUser, SafeOrganization } from "./authService";

const INVITATION_EXPIRATION_DAYS = 7;

export interface SafeInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt?: Date;
  inviterId?: string;
  inviter?: {
    id: string;
    name: string;
    email: string;
  };
  invitationLink?: string;
  invitationToken?: string;
}

export interface AcceptInvitationResult {
  user: SafeUser;
  organization: SafeOrganization;
}

export class InvitationService {
  /**
   * Create a new organization member invitation.
   * Enforces role-based invitation permissions and uniqueness checks.
   */
  async createInvitation(
    organizationId: string,
    inviterId: string,
    inviterRole: Role,
    input: CreateInvitationInput
  ): Promise<SafeInvitation> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const targetRole = input.role;

    // 1. Verify inviter role permissions against INVITATION_PERMISSIONS matrix
    const permittedRoles = INVITATION_PERMISSIONS[inviterRole] || [];
    if (!permittedRoles.includes(targetRole)) {
      throw new ForbiddenError(
        `Users with role '${inviterRole}' are not permitted to invite users with role '${targetRole}'`
      );
    }

    // 2. Enforce global user email uniqueness policy
    const existingUser = await userDao.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictError("An account with this email address already exists.");
    }

    // 3. Prevent duplicate active pending invitations for this email within this organization
    const pendingInvitation = await invitationDao.findPendingByOrgAndEmail(
      organizationId,
      normalizedEmail
    );
    if (pendingInvitation) {
      throw new ConflictError(
        "A pending invitation already exists for this email address."
      );
    }

    // 4. Generate cryptographically secure random token & hash for database storage
    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);

    // 5. Calculate expiration timestamp (7 days)
    const expiresAt = new Date(
      Date.now() + INVITATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000
    );

    // 6. Persist invitation record
    const invitation = await invitationDao.create({
      organizationId,
      email: normalizedEmail,
      role: targetRole,
      inviterId,
      tokenHash,
      expiresAt,
      status: INVITATION_STATUS.PENDING,
    });

    // 7. Construct safe response. In development/test mode only, provide the invitation link/token
    const isDevelopmentOrTest = config.NODE_ENV !== "production";
    const invitationLink = `${config.INVITATION_BASE_URL}?token=${rawToken}`;

    return {
      id: invitation._id.toString(),
      organizationId: invitation.organizationId.toString(),
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      inviterId: invitation.inviterId.toString(),
      ...(isDevelopmentOrTest
        ? {
            invitationLink,
            invitationToken: rawToken,
          }
        : {}),
    };
  }

  /**
   * List all invitations belonging to the caller's organization.
   * Token hashes and sensitive secrets are never exposed.
   */
  async listInvitations(
    organizationId: string,
    status?: InvitationStatus
  ): Promise<SafeInvitation[]> {
    const invitations = await invitationDao.findByOrg(organizationId, status);

    return invitations.map((inv) => {
      const populatedInviter = inv.inviterId as unknown as {
        _id?: Types.ObjectId;
        name?: string;
        email?: string;
      };

      return {
        id: inv._id.toString(),
        organizationId: inv.organizationId.toString(),
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        acceptedAt: inv.acceptedAt,
        inviterId: populatedInviter?._id?.toString() || inv.inviterId.toString(),
        inviter: populatedInviter?.name
          ? {
              id: populatedInviter._id?.toString() || "",
              name: populatedInviter.name,
              email: populatedInviter.email || "",
            }
          : undefined,
      };
    });
  }

  /**
   * Revoke an active pending invitation belonging to the caller's organization.
   */
  async revokeInvitation(
    invitationId: string,
    organizationId: string
  ): Promise<SafeInvitation> {
    if (!Types.ObjectId.isValid(invitationId)) {
      throw new NotFoundError("Invitation not found");
    }

    const invitation = await invitationDao.findById(invitationId);
    if (!invitation) {
      throw new NotFoundError("Invitation not found");
    }

    // Verify organization ownership
    if (invitation.organizationId.toString() !== organizationId.toString()) {
      throw new ForbiddenError(
        "Access denied: cannot revoke invitation belonging to another organization"
      );
    }

    // Prevent revoking already accepted or revoked invitations
    if (invitation.status !== INVITATION_STATUS.PENDING) {
      throw new ConflictError(
        `Invitation is already ${invitation.status.toLowerCase()} and cannot be revoked`
      );
    }

    // Handle expired invitations consistently
    if (invitation.expiresAt <= new Date()) {
      throw new ConflictError("Invitation has expired and cannot be revoked");
    }

    const revoked = await invitationDao.revokeInvitation(
      invitationId,
      organizationId
    );

    if (!revoked) {
      throw new ConflictError("Failed to revoke invitation or invitation no longer pending");
    }

    return {
      id: revoked._id.toString(),
      organizationId: revoked.organizationId.toString(),
      email: revoked.email,
      role: revoked.role,
      status: revoked.status,
      expiresAt: revoked.expiresAt,
      createdAt: revoked.createdAt,
      inviterId: revoked.inviterId.toString(),
    };
  }

  /**
   * Accept an invitation and provision the user account.
   * Guarantees atomic single-use acceptance and protection against concurrent attempts.
   */
  async acceptInvitation(
    input: AcceptInvitationInput
  ): Promise<AcceptInvitationResult> {
    const tokenHash = hashToken(input.token);

    // 1. Locate invitation by token hash
    const invitation = await invitationDao.findByTokenHash(tokenHash);
    if (!invitation) {
      throw new NotFoundError("Invalid or expired invitation token");
    }

    // 2. Validate invitation status and expiration
    if (invitation.status === INVITATION_STATUS.ACCEPTED) {
      throw new ConflictError("Invitation has already been accepted");
    }

    if (invitation.status === INVITATION_STATUS.REVOKED) {
      throw new ConflictError("Invitation has been revoked and cannot be accepted");
    }

    if (invitation.expiresAt <= new Date()) {
      throw new ConflictError("Invitation has expired and cannot be accepted");
    }

    // 3. Verify email does not already belong to an active user
    const existingUser = await userDao.findByEmail(invitation.email);
    if (existingUser) {
      throw new ConflictError("An account with this email address already exists.");
    }

    // 4. Verify associated organization still exists
    const org = await organizationDao.findById(invitation.organizationId);
    if (!org) {
      throw new NotFoundError("Associated organization not found");
    }

    // 5. Hash user password
    const passwordHash = await hashPassword(input.password);

    // 6. Atomic acceptance and account creation
    const supportsTransactions = isTransactionSupported();

    if (supportsTransactions) {
      const session: ClientSession = await mongoose.startSession();
      try {
        let createdUserId = "";

        await session.withTransaction(async () => {
          // Atomically mark invitation ACCEPTED inside transaction
          const accepted = await invitationDao.acceptInvitation(invitation._id, session);
          if (!accepted) {
            throw new ConflictError("Invitation has already been accepted or is no longer valid");
          }

          // Create the user with verified invitation details (never trust client payload)
          const newUser = await userDao.create(
            {
              name: input.name.trim(),
              email: invitation.email,
              passwordHash,
              role: invitation.role,
              organizationId: invitation.organizationId,
              isActive: true,
            },
            session
          );

          createdUserId = newUser._id.toString();
        });

        const user = (await userDao.findById(createdUserId))!;

        return {
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
          },
          organization: {
            id: org._id.toString(),
            name: org.name,
            slug: org.slug,
            statusPageEnabled: org.statusPageEnabled,
          },
        };
      } finally {
        await session.endSession();
      }
    } else {
      // Standalone MongoDB fallback: Atomic findOneAndUpdate claim with compensating rollback
      // 1. Atomically claim the invitation first. Exactly one concurrent worker will succeed.
      const accepted = await invitationDao.acceptInvitation(invitation._id);
      if (!accepted) {
        throw new ConflictError("Invitation has already been accepted or is no longer valid");
      }

      // 2. Create the user
      try {
        const user = await userDao.create({
          name: input.name.trim(),
          email: invitation.email,
          passwordHash,
          role: invitation.role,
          organizationId: invitation.organizationId,
          isActive: true,
        });

        return {
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
          },
          organization: {
            id: org._id.toString(),
            name: org.name,
            slug: org.slug,
            statusPageEnabled: org.statusPageEnabled,
          },
        };
      } catch (userCreateError) {
        // Compensating rollback: Revert invitation status back to PENDING
        console.error(
          "❌ User creation failed after invitation claim. Performing compensating rollback on invitation status..."
        );
        await Invitation.findByIdAndUpdate(invitation._id, {
          $set: { status: INVITATION_STATUS.PENDING },
          $unset: { acceptedAt: 1 },
        });
        throw userCreateError;
      }
    }
  }
}

export const invitationService = new InvitationService();
export default invitationService;
