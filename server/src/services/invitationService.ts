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
import { emailDeliveryService } from "./emailDeliveryService";

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
  emailSent?: boolean;
  emailDeliveryError?: string;
  warning?: string;
}

export interface AcceptInvitationResult {
  user: SafeUser;
  organization: SafeOrganization;
}

export function buildInvitationLink(rawToken: string): string {
  const rawBase = config.CLIENT_URL?.trim() || config.INVITATION_BASE_URL?.trim() || "http://localhost:5173/accept-invitation";
  
  let baseUrl: string;
  if (config.CLIENT_URL?.trim()) {
    const cleanClient = config.CLIENT_URL.trim().replace(/\/+$/, "");
    baseUrl = cleanClient.endsWith("/accept-invitation") ? cleanClient : `${cleanClient}/accept-invitation`;
  } else {
    const cleanBase = rawBase.replace(/\/+$/, "");
    baseUrl = cleanBase.endsWith("/accept-invitation") ? cleanBase : `${cleanBase}/accept-invitation`;
  }

  return `${baseUrl}?token=${encodeURIComponent(rawToken)}`;
}

interface InvitationEmailParams {
  subject: string;
  orgName: string;
  inviterName: string;
  targetRole: Role;
  invitationLink: string;
}

function generateInvitationEmailHtml(params: InvitationEmailParams): string {
  const { subject, orgName, inviterName, targetRole, invitationLink } = params;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ECECE8; margin: 0; padding: 24px 16px; color: #111113;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #EEEEE9; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);">
    <tr>
      <td style="padding: 32px 32px 24px; text-align: left;">
        <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
          <tr>
            <td style="vertical-align: middle;">
              <span style="display: inline-block; width: 36px; height: 36px; line-height: 36px; text-align: center; background-color: #111113; color: #FFFFFF; border-radius: 10px; font-weight: 700; font-size: 18px;">R</span>
            </td>
            <td style="vertical-align: middle; padding-left: 10px;">
              <span style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: #111113;">Resolver</span>
            </td>
          </tr>
        </table>
        
        <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #111113; letter-spacing: -0.02em;">You've been invited!</h1>
        <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px; color: #55555C;">
          <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on <strong>Resolver</strong> as a <strong>${targetRole}</strong>.
        </p>
        
        <table border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
          <tr>
            <td style="border-radius: 12px; background-color: #111113; text-align: center;">
              <a href="${invitationLink}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 12px; letter-spacing: -0.01em;">
                Accept Invitation &rarr;
              </a>
            </td>
          </tr>
        </table>
        
        <p style="font-size: 12px; line-height: 1.5; color: #6B6B72; margin: 0 0 8px;">
          Or copy and paste this link into your browser:
        </p>
        <p style="font-size: 12px; line-height: 1.5; color: #6A4CFF; word-break: break-all; margin: 0 0 24px;">
          <a href="${invitationLink}" style="color: #6A4CFF; text-decoration: underline;">${invitationLink}</a>
        </p>

        <p style="font-size: 12px; line-height: 1.5; color: #9E9EA7; margin: 0;">
          This invitation link will expire in ${INVITATION_EXPIRATION_DAYS} days. If you did not expect this invitation, please ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #F7F7F5; padding: 16px 32px; border-top: 1px solid #EEEEE9; text-align: center; font-size: 11px; color: #9E9EA7;">
        Resolver Incident Management Platform &bull; Automated System Email
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
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

    // 7. Construct secure invitation URL
    const invitationLink = buildInvitationLink(rawToken);

    // 8. Deliver invitation email with the onboarding link
    let emailSent = false;
    let emailDeliveryError: string | undefined;

    try {
      const [organization, inviter] = await Promise.all([
        organizationDao.findById(organizationId),
        userDao.findById(inviterId),
      ]);

      const orgName = organization?.name || "your organization";
      const inviterName = inviter?.name || "A team member";

      const subject = `Invitation to join ${orgName} on Resolver`;
      const text = `Hello,\n\n${inviterName} has invited you to join ${orgName} on Resolver as a ${targetRole}.\n\nClick the link below to accept your invitation and set up your account:\n${invitationLink}\n\nThis invitation link expires in ${INVITATION_EXPIRATION_DAYS} days.\n\nIf you did not expect this invitation, you can safely ignore this email.\n\nBest regards,\nThe Resolver Team`;
      const html = generateInvitationEmailHtml({
        subject,
        orgName,
        inviterName,
        targetRole,
        invitationLink,
      });

      const deliveryResult = await emailDeliveryService.sendEmail({
        to: normalizedEmail,
        recipientName: normalizedEmail,
        subject,
        text,
        html,
        metadata: {
          organizationId,
          inviterId,
          role: targetRole,
          invitationId: invitation._id.toString(),
        },
      });

      emailSent = deliveryResult.success;
      if (!deliveryResult.success) {
        emailDeliveryError = deliveryResult.error || "Email delivery failed";
      }
    } catch (emailErr) {
      emailSent = false;
      emailDeliveryError = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error(
        `[InvitationService] Failed to dispatch invitation email to ${normalizedEmail}:`,
        emailErr
      );
    }

    // 9. Construct safe response
    return {
      id: invitation._id.toString(),
      organizationId: invitation.organizationId.toString(),
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      inviterId: invitation.inviterId.toString(),
      invitationLink,
      invitationToken: rawToken,
      emailSent,
      emailDeliveryError,
      warning: !emailSent ? "Email could not be sent" : undefined,
    };
  }

  /**
   * Resend an active pending invitation and refresh the security token.
   */
  async resendInvitation(
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

    if (invitation.organizationId.toString() !== organizationId.toString()) {
      throw new ForbiddenError(
        "Access denied: cannot resend invitation belonging to another organization"
      );
    }

    if (invitation.status !== INVITATION_STATUS.PENDING) {
      throw new ConflictError(
        `Invitation is already ${invitation.status.toLowerCase()} and cannot be resent`
      );
    }

    // Refresh token and expiration
    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    invitation.tokenHash = tokenHash;
    invitation.expiresAt = expiresAt;
    await invitation.save();

    const invitationLink = buildInvitationLink(rawToken);

    let emailSent = false;
    let emailDeliveryError: string | undefined;

    try {
      const [organization, inviter] = await Promise.all([
        organizationDao.findById(organizationId),
        userDao.findById(invitation.inviterId),
      ]);

      const orgName = organization?.name || "your organization";
      const inviterName = inviter?.name || "A team member";

      const subject = `Invitation to join ${orgName} on Resolver`;
      const text = `Hello,\n\n${inviterName} has invited you to join ${orgName} on Resolver as a ${invitation.role}.\n\nClick the link below to accept your invitation and set up your account:\n${invitationLink}\n\nThis invitation link expires in ${INVITATION_EXPIRATION_DAYS} days.\n\nIf you did not expect this invitation, you can safely ignore this email.\n\nBest regards,\nThe Resolver Team`;
      const html = generateInvitationEmailHtml({
        subject,
        orgName,
        inviterName,
        targetRole: invitation.role,
        invitationLink,
      });

      const deliveryResult = await emailDeliveryService.sendEmail({
        to: invitation.email,
        recipientName: invitation.email,
        subject,
        text,
        html,
        metadata: {
          organizationId,
          inviterId: invitation.inviterId.toString(),
          role: invitation.role,
          invitationId: invitation._id.toString(),
        },
      });

      emailSent = deliveryResult.success;
      if (!deliveryResult.success) {
        emailDeliveryError = deliveryResult.error || "Email delivery failed";
      }
    } catch (emailErr) {
      emailSent = false;
      emailDeliveryError = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error(
        `[InvitationService] Failed to resend invitation email to ${invitation.email}:`,
        emailErr
      );
    }

    return {
      id: invitation._id.toString(),
      organizationId: invitation.organizationId.toString(),
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      inviterId: invitation.inviterId.toString(),
      invitationLink,
      invitationToken: rawToken,
      emailSent,
      emailDeliveryError,
      warning: !emailSent ? "Email could not be sent" : undefined,
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
