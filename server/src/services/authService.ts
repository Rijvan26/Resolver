import mongoose, { ClientSession, Types } from "mongoose";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/User";
import { organizationDao } from "../dao/organizationDao";
import { userDao } from "../dao/userDao";
import { refreshTokenDao } from "../dao/refreshTokenDao";
import { invitationDao } from "../dao/invitationDao";
import { isTransactionSupported } from "../config/db";
import { config } from "../config/config";
import { ROLES, AuthUserPayload, INVITATION_STATUS } from "../types";
import { ConflictError, AuthenticationError, NotFoundError, ValidationError } from "../utils/errors";
import { hashPassword, comparePassword } from "../utils/passwordUtils";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  slugify,
} from "../utils/tokenUtils";
import {
  RegisterOrganizationInput,
  LoginInput,
  GoogleAuthInput,
  CompleteGoogleSetupInput,
  SetPasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "../validations/authValidation";
import { emailDeliveryService } from "./emailDeliveryService";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  authProvider?: string;
  hasPassword?: boolean;
}

export interface SafeOrganization {
  id: string;
  name: string;
  slug: string;
  statusPageEnabled: boolean;
}

export interface RegistrationResult {
  organization: SafeOrganization;
  user: SafeUser;
}

export interface AuthSessionResult {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
  organization: SafeOrganization;
}

export interface GoogleWorkspaceSetupRequired {
  requiresWorkspaceSetup: true;
  setupToken: string;
  suggestedOrgName: string;
  suggestedSlug: string;
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
}

export type GoogleAuthResult = AuthSessionResult | GoogleWorkspaceSetupRequired;

export class AuthService {
  /**
   * Register a new organization and creator account.
   * Uses MongoDB transaction if supported, with compensating rollback fallback on standalone deployments.
   */
  async registerOrganization(input: RegisterOrganizationInput): Promise<RegistrationResult> {
    const creatorName = (input.creatorName || input.name || "").trim();
    const email = input.email.toLowerCase().trim();
    const orgName = input.organizationName.trim();
    const slug = (input.slug ? slugify(input.slug) : slugify(orgName)).trim();

    // 1. Check uniqueness constraints
    const orgExists = await organizationDao.existsBySlug(slug);
    if (orgExists) {
      throw new ConflictError(`An organization with the slug '${slug}' already exists. Please choose a different name or slug.`);
    }

    const existingUser = await userDao.findByEmail(email);
    if (existingUser) {
      throw new ConflictError("An account with this email address already exists.");
    }

    // 2. Hash password
    const passwordHash = await hashPassword(input.password);

    // 3. Execution with or without MongoDB transaction
    const supportsTransactions = isTransactionSupported();

    if (supportsTransactions) {
      const session: ClientSession = await mongoose.startSession();
      try {
        let createdOrgId: string = "";
        let createdUserId: string = "";

        await session.withTransaction(async () => {
          const org = await organizationDao.create(
            { name: orgName, slug, statusPageEnabled: false },
            session
          );
          createdOrgId = org._id.toString();

          const user = await userDao.create(
            {
              name: creatorName,
              email,
              passwordHash,
              role: ROLES.SUPER_ADMIN,
              organizationId: org._id,
              isActive: true,
            },
            session
          );
          createdUserId = user._id.toString();
        });

        const org = (await organizationDao.findById(createdOrgId))!;
        const user = (await userDao.findById(createdUserId))!;

        return {
          organization: {
            id: org._id.toString(),
            name: org.name,
            slug: org.slug,
            statusPageEnabled: org.statusPageEnabled,
          },
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            hasPassword: true,
          },
        };
      } finally {
        await session.endSession();
      }
    } else {
      // Standalone MongoDB fallback with compensating rollback
      if (config.NODE_ENV !== "test") {
        console.warn(
          "⚠️ [Registration] Transactions unsupported on standalone MongoDB. Executing sequential creation with compensating rollback."
        );
      }

      const org = await organizationDao.create({
        name: orgName,
        slug,
        statusPageEnabled: false,
      });

      try {
        const user = await userDao.create({
          name: creatorName,
          email,
          passwordHash,
          role: ROLES.SUPER_ADMIN,
          organizationId: org._id,
          isActive: true,
        });

        return {
          organization: {
            id: org._id.toString(),
            name: org.name,
            slug: org.slug,
            statusPageEnabled: org.statusPageEnabled,
          },
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            hasPassword: true,
          },
        };
      } catch (userCreationError) {
        // Compensating rollback: Clean up created organization if user creation fails
        console.error("❌ User creation failed. Performing compensating rollback on created organization...");
        await organizationDao.deleteById(org._id);
        throw userCreationError;
      }
    }
  }

  /**
   * Authenticate user with email and password and establish token sessions.
   */
  async login(input: LoginInput): Promise<AuthSessionResult> {
    const email = input.email.toLowerCase().trim();

    // 1. Find user by email (selecting passwordHash)
    const user = await userDao.findByEmail(email, true);
    if (!user) {
      // Generic error to prevent account enumeration
      throw new AuthenticationError("Invalid email or password");
    }

    // 2. Verify password hash
    if (!user.passwordHash) {
      throw new AuthenticationError("This account uses Google Sign-In. Please sign in with Google.");
    }

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError("Invalid email or password");
    }

    // 3. Verify user active status
    if (!user.isActive) {
      throw new AuthenticationError("Account is deactivated. Please contact your administrator.");
    }

    // 4. Verify organization
    const org = await organizationDao.findById(user.organizationId);
    if (!org) {
      throw new AuthenticationError("Associated organization not found");
    }

    // 5. Generate Access Token & Refresh Token Session
    return this.createAuthSession(user, org);
  }

  /**
   * Helper to generate Access Token & Refresh Token Session.
   */
  private async createAuthSession(
    user: {
      _id: Types.ObjectId | string;
      name: string;
      email: string;
      role: any;
      avatarUrl?: string;
      authProvider?: string;
      passwordHash?: string;
    },
    org: { _id: Types.ObjectId | string; name: string; slug: string; statusPageEnabled: boolean }
  ): Promise<AuthSessionResult> {
    const authPayload: AuthUserPayload = {
      userId: user._id.toString(),
      organizationId: org._id.toString(),
      role: user.role,
      email: user.email,
    };

    const accessToken = generateAccessToken(authPayload);
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const family = crypto.randomUUID();

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await refreshTokenDao.create({
      userId: user._id as Types.ObjectId,
      organizationId: org._id as Types.ObjectId,
      tokenHash,
      family,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        authProvider: user.authProvider,
        hasPassword: !!user.passwordHash,
      },
      organization: {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        statusPageEnabled: org.statusPageEnabled,
      },
    };
  }

  /**
   * Authenticate or register a user using a Google OAuth ID Token.
   */
  async googleAuth(input: GoogleAuthInput): Promise<GoogleAuthResult> {
    const clientId = config.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new AuthenticationError("Google OAuth is not configured on the server");
    }

    const client = new OAuth2Client(clientId);
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: input.idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Verification failed";
      throw new AuthenticationError(`Google authentication failed: ${message}`);
    }

    if (!payload || !payload.email) {
      throw new AuthenticationError("Google token does not contain a verified email address");
    }

    const email = payload.email.toLowerCase().trim();
    const googleId = payload.sub;
    const name = (payload.name || email.split("@")[0] || "User").trim();
    const avatarUrl = payload.picture || undefined;

    // 1. Check if user exists by email or googleId (selecting passwordHash to detect if password is set)
    let user = await userDao.findByEmail(email, true);
    if (!user && googleId) {
      user = await userDao.findByGoogleId(googleId, true);
    }

    let organization;

    if (user) {
      // Existing User Login
      if (!user.isActive) {
        throw new AuthenticationError("Account is deactivated. Please contact your administrator.");
      }

      // Link googleId or avatar if not yet set
      const updates: Record<string, unknown> = {};
      if (!user.googleId) updates.googleId = googleId;
      if (!user.avatarUrl && avatarUrl) updates.avatarUrl = avatarUrl;
      if (!user.authProvider || user.authProvider === "local") updates.authProvider = "google";
      if (Object.keys(updates).length > 0) {
        await userDao.updateById(user._id, updates);
      }

      organization = await organizationDao.findById(user.organizationId);
      if (!organization) {
        throw new AuthenticationError("Associated organization not found");
      }
    } else if (input.invitationToken) {
      // 2. Invited User accepting invitation via Google
      const tokenHash = hashToken(input.invitationToken);
      const invitation = await invitationDao.findByTokenHash(tokenHash);

      if (!invitation) {
        throw new NotFoundError("Invalid or expired invitation token");
      }
      if (invitation.status === INVITATION_STATUS.ACCEPTED) {
        throw new ConflictError("Invitation has already been accepted");
      }
      if (invitation.status === INVITATION_STATUS.REVOKED) {
        throw new ConflictError("Invitation has been revoked");
      }
      if (invitation.expiresAt <= new Date()) {
        throw new ConflictError("Invitation has expired");
      }

      organization = await organizationDao.findById(invitation.organizationId);
      if (!organization) {
        throw new NotFoundError("Associated organization not found");
      }

      await invitationDao.acceptInvitation(invitation._id);

      user = await userDao.create({
        name,
        email,
        role: invitation.role,
        organizationId: organization._id,
        authProvider: "google",
        googleId,
        avatarUrl,
        isActive: true,
      });
    } else {
      // 3. New User Registration with new Organization
      // If organizationName and slug were already provided (e.g. from RegisterOrgPage):
      if (input.organizationName && input.slug) {
        const orgName = input.organizationName.trim();
        const slug = slugify(input.slug);
        if (!slug) {
          throw new ValidationError("Invalid workspace slug");
        }

        const slugExists = await organizationDao.existsBySlug(slug);
        if (slugExists) {
          throw new ConflictError(
            `An organization with the slug '${slug}' already exists. Please choose a different slug.`
          );
        }

        organization = await organizationDao.create({
          name: orgName,
          slug,
          statusPageEnabled: false,
        });

        user = await userDao.create({
          name,
          email,
          role: ROLES.SUPER_ADMIN,
          organizationId: organization._id,
          authProvider: "google",
          googleId,
          avatarUrl,
          isActive: true,
        });

        return this.createAuthSession(user, organization);
      }

      // Standard Flow: Return workspace setup requirement for interactive user onboarding
      const setupToken = jwt.sign(
        {
          type: "google_signup",
          email,
          googleId,
          name,
          avatarUrl,
        },
        config.JWT_ACCESS_SECRET,
        { expiresIn: "15m" }
      );

      const suggestedOrgName = input.organizationName || `${name}'s Team`;
      const suggestedSlug = slugify(input.organizationName || name) || "workspace";

      return {
        requiresWorkspaceSetup: true,
        setupToken,
        suggestedOrgName,
        suggestedSlug,
        user: {
          name,
          email,
          avatarUrl,
        },
      };
    }

    return this.createAuthSession(user, organization);
  }

  /**
   * Complete Google OAuth Workspace Setup for new users.
   */
  async completeGoogleSetup(input: CompleteGoogleSetupInput): Promise<AuthSessionResult> {
    let decoded: any;
    try {
      decoded = jwt.verify(input.setupToken, config.JWT_ACCESS_SECRET);
    } catch {
      throw new AuthenticationError("Your signup session has expired. Please sign in with Google again.");
    }

    if (!decoded || decoded.type !== "google_signup" || !decoded.email || !decoded.googleId) {
      throw new AuthenticationError("Invalid signup token. Please sign in with Google again.");
    }

    const email = decoded.email.toLowerCase().trim();
    const googleId = decoded.googleId;
    const name = decoded.name || email.split("@")[0];
    const avatarUrl = decoded.avatarUrl;

    // Check if user already exists
    const existingUser = await userDao.findByEmail(email);
    if (existingUser) {
      throw new ConflictError("An account with this email address already exists.");
    }

    const slug = slugify(input.slug);
    if (!slug) {
      throw new ValidationError("Invalid workspace slug");
    }

    const slugExists = await organizationDao.existsBySlug(slug);
    if (slugExists) {
      throw new ConflictError(`The workspace URL '${slug}' is already taken. Please choose another.`);
    }

    // Create organization
    const organization = await organizationDao.create({
      name: input.organizationName.trim(),
      slug,
      statusPageEnabled: false,
    });

    // Create Super Admin user
    const user = await userDao.create({
      name,
      email,
      role: ROLES.SUPER_ADMIN,
      organizationId: organization._id,
      authProvider: "google",
      googleId,
      avatarUrl,
      isActive: true,
    });

    return this.createAuthSession(user, organization);
  }

  /**
   * Rotate refresh token and issue new access token pair.
   * Implements reuse detection: if a revoked token is presented, all sessions in the family are invalidated.
   */
  async refreshSession(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!rawRefreshToken) {
      throw new AuthenticationError("Refresh token is required");
    }

    const incomingHash = hashToken(rawRefreshToken);
    const existingToken = await refreshTokenDao.findByTokenHash(incomingHash);

    if (!existingToken) {
      throw new AuthenticationError("Invalid or expired refresh token");
    }

    // Check expiration
    if (new Date() > existingToken.expiresAt) {
      throw new AuthenticationError("Refresh token has expired");
    }

    // Reuse detection: Token has already been revoked!
    if (existingToken.isRevoked) {
      // Invalidate the whole family to protect the user against stolen token replay
      await refreshTokenDao.revokeFamily(existingToken.family);
      throw new AuthenticationError(
        "Invalid token state: Token reuse detected. All sessions in this session family have been revoked."
      );
    }

    // Revoke the used token immediately
    await refreshTokenDao.revokeById(existingToken._id);

    // Verify user and org remain active
    const user = await userDao.findById(existingToken.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError("User is no longer active");
    }

    const org = await organizationDao.findById(existingToken.organizationId);
    if (!org) {
      throw new AuthenticationError("Organization no longer exists");
    }

    // Issue new pair within the same token family
    const authPayload: AuthUserPayload = {
      userId: user._id.toString(),
      organizationId: org._id.toString(),
      role: user.role,
      email: user.email,
    };

    const newAccessToken = generateAccessToken(authPayload);
    const newRawRefreshToken = generateRefreshToken();
    const newHash = hashToken(newRawRefreshToken);

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await refreshTokenDao.create({
      userId: user._id,
      organizationId: org._id,
      tokenHash: newHash,
      family: existingToken.family, // Maintain rotation lineage
      expiresAt: newExpiresAt,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  /**
   * Invalidate a refresh token session upon logout.
   */
  async logout(rawRefreshToken?: string): Promise<void> {
    if (rawRefreshToken) {
      const incomingHash = hashToken(rawRefreshToken);
      const token = await refreshTokenDao.findByTokenHash(incomingHash);
      if (token && !token.isRevoked) {
        await refreshTokenDao.revokeById(token._id);
      }
    }
  }

  /**
   * Get safe profile of the authenticated user and organization.
   */
  async getMe(userId: string, organizationId: string): Promise<{ user: SafeUser; organization: SafeOrganization }> {
    const user = await userDao.findById(userId, true);
    if (!user || !user.isActive) {
      throw new NotFoundError("User not found or inactive");
    }

    const org = await organizationDao.findById(organizationId);
    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        authProvider: user.authProvider,
        hasPassword: !!user.passwordHash,
      },
      organization: {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        statusPageEnabled: org.statusPageEnabled,
      },
    };
  }

  /**
   * Set or change password for an authenticated user.
   * If the user already has a password, currentPassword is required and verified.
   * If the user does not have a password (e.g. Google-only sign in), they can set one directly.
   */
  async setPassword(userId: string, input: SetPasswordInput): Promise<{ message: string; hasPassword: boolean }> {
    const user = await userDao.findById(userId, true);
    if (!user || !user.isActive) {
      throw new NotFoundError("User not found or inactive");
    }

    const hasExistingPassword = !!user.passwordHash;

    if (hasExistingPassword) {
      if (!input.currentPassword) {
        throw new ValidationError("Current password is required to change your password");
      }
      const isMatch = await comparePassword(input.currentPassword, user.passwordHash!);
      if (!isMatch) {
        throw new AuthenticationError("Current password is incorrect");
      }
      const isSame = await comparePassword(input.newPassword, user.passwordHash!);
      if (isSame) {
        throw new ValidationError("New password cannot be the same as your current password");
      }
    }

    const passwordHash = await hashPassword(input.newPassword);
    await User.findByIdAndUpdate(userId, {
      $set: { passwordHash },
    });

    return {
      message: hasExistingPassword
        ? "Password updated successfully"
        : "Password created successfully. You can now sign in using your email and password.",
      hasPassword: true,
    };
  }

  /**
   * Request password reset link.
   * If the account exists, generates a secure 60-minute token and sends a reset email.
   * Always returns a generic success response to prevent account enumeration.
   */
  async forgotPassword(input: ForgotPasswordInput): Promise<{ message: string; resetToken?: string }> {
    const email = input.email.toLowerCase().trim();
    const user = await User.findOne({ email }).select("+passwordResetTokenHash +passwordResetExpiresAt");

    const genericMessage = "If an account with that email exists, we have sent a password reset link.";

    if (!user || !user.isActive) {
      return { message: genericMessage };
    }

    // Generate high-entropy 32-byte cryptographically secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.passwordResetTokenHash = tokenHash;
    user.passwordResetExpiresAt = expiresAt;
    await user.save();

    const clientBaseUrl = config.CLIENT_URL || config.CORS_ORIGIN || "http://localhost:5173";
    const resetLink = `${clientBaseUrl.replace(/\/$/, "")}/reset-password?token=${rawToken}`;

    const text = `Hello ${user.name},\n\nWe received a request to reset your Resolver account password.\n\nPlease visit the following link to reset your password:\n${resetLink}\n\nThis link will expire in 60 minutes.\nIf you did not request this, you can safely ignore this message.\n\nBest regards,\nThe Resolver Team`;
    const html = generatePasswordResetEmailHtml({
      name: user.name,
      resetLink,
    });

    try {
      await emailDeliveryService.sendEmail({
        to: user.email,
        recipientName: user.name,
        subject: "Reset your Resolver account password",
        text,
        html,
        metadata: {
          userId: user._id.toString(),
          type: "password_reset",
        },
      });
    } catch (err) {
      console.error("❌ Failed to send password reset email:", err);
    }

    return {
      message: genericMessage,
      ...(config.NODE_ENV === "test" ? { resetToken: rawToken } : {}),
    };
  }

  /**
   * Reset password using a valid reset token.
   * Invalidates existing reset token and revokes all active refresh sessions for the user.
   */
  async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    const tokenHash = hashToken(input.token);

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpiresAt +passwordHash");

    if (!user || !user.isActive) {
      throw new AuthenticationError("Password reset link is invalid or has expired. Please request a new one.");
    }

    // Hash the new password
    const newPasswordHash = await hashPassword(input.newPassword);

    user.passwordHash = newPasswordHash;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();

    // Revoke all existing sessions for this user across all devices
    await refreshTokenDao.revokeAllForUser(user._id);

    return {
      message: "Your password has been reset successfully. You can now log in with your new password.",
    };
  }
}

interface PasswordResetEmailParams {
  name: string;
  resetLink: string;
}

function generatePasswordResetEmailHtml(params: PasswordResetEmailParams): string {
  const { name, resetLink } = params;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
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

        <h1 style="font-size: 22px; font-weight: 700; color: #111113; margin: 0 0 12px; letter-spacing: -0.02em;">
          Reset Your Password
        </h1>

        <p style="font-size: 14px; line-height: 1.6; color: #4B4B4F; margin: 0 0 20px;">
          Hello ${name || "there"},<br><br>
          We received a request to reset the password for your Resolver account. Click the button below to choose a new password:
        </p>

        <div style="margin: 28px 0; text-align: left;">
          <a href="${resetLink}" style="display: inline-block; background-color: #111113; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 9999px; letter-spacing: -0.01em; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
            Reset Password
          </a>
        </div>

        <p style="font-size: 12px; line-height: 1.5; color: #76767A; margin: 24px 0 0;">
          Or copy and paste this link into your browser:<br>
          <a href="${resetLink}" style="color: #2563EB; word-break: break-all; text-decoration: underline;">
            ${resetLink}
          </a>
        </p>

        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #EEEEE9; font-size: 12px; color: #8E8E93; line-height: 1.5;">
          This password reset link will expire in 60 minutes.<br>
          If you did not request this, you can safely ignore this email — your password will remain unchanged.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export const authService = new AuthService();
export default authService;
