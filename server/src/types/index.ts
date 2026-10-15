import { Request } from "express";

/**
 * Supported User Roles in Resolver
 */
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  DEVELOPER: "DEVELOPER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Roles permitted to send invitations and their allowed target roles
 */
export const INVITATION_PERMISSIONS: Record<Role, Role[]> = {
  SUPER_ADMIN: [ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER],
  ADMIN: [ROLES.MANAGER, ROLES.DEVELOPER],
  MANAGER: [],
  DEVELOPER: [],
};

/**
 * Roles permitted to assign new roles to members (actorRole -> allowed new roles)
 */
export const MEMBER_ROLE_ASSIGNMENT_PERMISSIONS: Record<Role, Role[]> = {
  SUPER_ADMIN: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER],
  ADMIN: [ROLES.MANAGER, ROLES.DEVELOPER],
  MANAGER: [],
  DEVELOPER: [],
};

/**
 * Roles permitted to modify members (role or status) based on the target member's current role
 */
export const MEMBER_MODIFICATION_TARGET_PERMISSIONS: Record<Role, Role[]> = {
  SUPER_ADMIN: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER],
  ADMIN: [ROLES.MANAGER, ROLES.DEVELOPER],
  MANAGER: [],
  DEVELOPER: [],
};

/**
 * Invitation status lifecycle
 */
export const INVITATION_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REVOKED: "REVOKED",
} as const;

export type InvitationStatus = (typeof INVITATION_STATUS)[keyof typeof INVITATION_STATUS];

/**
 * Authenticated JWT payload / attached user context
 */
export interface AuthUserPayload {
  userId: string;
  organizationId: string;
  role: Role;
  email: string;
}

/**
 * Standard API Success Response Envelope
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Standard API Error Response Envelope
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

/**
 * Express Request augmented with authenticated user context
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
  organizationId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
      organizationId?: string;
    }
  }
}
