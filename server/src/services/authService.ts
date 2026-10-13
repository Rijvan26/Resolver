import mongoose, { ClientSession } from "mongoose";
import crypto from "crypto";
import { organizationDao } from "../dao/organizationDao";
import { userDao } from "../dao/userDao";
import { refreshTokenDao } from "../dao/refreshTokenDao";
import { isTransactionSupported } from "../config/db";
import { config } from "../config/config";
import { ROLES, AuthUserPayload } from "../types";
import { ConflictError, AuthenticationError, NotFoundError } from "../utils/errors";
import { hashPassword, comparePassword } from "../utils/passwordUtils";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  slugify,
} from "../utils/tokenUtils";
import { RegisterOrganizationInput, LoginInput } from "../validations/authValidation";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: string;
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
      userId: user._id,
      organizationId: org._id,
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
    const user = await userDao.findById(userId);
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
      },
      organization: {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        statusPageEnabled: org.statusPageEnabled,
      },
    };
  }
}

export const authService = new AuthService();
export default authService;
