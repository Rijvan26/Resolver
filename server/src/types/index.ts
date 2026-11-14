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
 * Incident status lifecycle
 */
export const INCIDENT_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
} as const;

export type IncidentStatus = (typeof INCIDENT_STATUS)[keyof typeof INCIDENT_STATUS];

/**
 * Incident priority levels
 */

export const INCIDENT_PRIORITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;

export type IncidentPriority = (typeof INCIDENT_PRIORITY)[keyof typeof INCIDENT_PRIORITY];

/**
 * Incident creation permissions by role
 */
export const INCIDENT_PRIORITY_CREATION_PERMISSIONS: Record<Role, IncidentPriority[]> = {
  SUPER_ADMIN: [INCIDENT_PRIORITY.LOW, INCIDENT_PRIORITY.MEDIUM, INCIDENT_PRIORITY.HIGH, INCIDENT_PRIORITY.CRITICAL],
  ADMIN: [INCIDENT_PRIORITY.LOW, INCIDENT_PRIORITY.MEDIUM, INCIDENT_PRIORITY.HIGH, INCIDENT_PRIORITY.CRITICAL],
  MANAGER: [INCIDENT_PRIORITY.LOW, INCIDENT_PRIORITY.MEDIUM, INCIDENT_PRIORITY.HIGH, INCIDENT_PRIORITY.CRITICAL],
  DEVELOPER: [INCIDENT_PRIORITY.LOW, INCIDENT_PRIORITY.MEDIUM, INCIDENT_PRIORITY.HIGH],
};

export const INCIDENT_STATUS_CREATION_PERMISSIONS: Record<Role, IncidentStatus[]> = {
  SUPER_ADMIN: [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IN_PROGRESS, INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.CLOSED],
  ADMIN: [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IN_PROGRESS, INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.CLOSED],
  MANAGER: [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IN_PROGRESS, INCIDENT_STATUS.RESOLVED],
  DEVELOPER: [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IN_PROGRESS],
};

/**
 * Roles permitted to modify incident severity (priority) during update
 */
export const INCIDENT_PRIORITY_UPDATE_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.MANAGER,
];

/**
 * Roles permitted to close an incident
 */
export const INCIDENT_CLOSE_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.MANAGER,
];

/**
 * Roles an actor is permitted to assign an incident to
 */
export const INCIDENT_ASSIGNMENT_PERMISSIONS: Record<Role, Role[]> = {
  SUPER_ADMIN: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER],
  ADMIN: [ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER],
  MANAGER: [ROLES.MANAGER, ROLES.DEVELOPER],
  DEVELOPER: [ROLES.DEVELOPER],
};

/**
 * Activity & Audit log action types
 */
export const ACTIVITY_ACTION = {
  INCIDENT_CREATED: "INCIDENT_CREATED",
  STATUS_CHANGED: "STATUS_CHANGED",
  PRIORITY_CHANGED: "PRIORITY_CHANGED",
  ASSIGNEE_CHANGED: "ASSIGNEE_CHANGED",
  DETAILS_UPDATED: "DETAILS_UPDATED",
  COMMENT_ADDED: "COMMENT_ADDED",
  COMMENT_UPDATED: "COMMENT_UPDATED",
  COMMENT_DELETED: "COMMENT_DELETED",
  INCIDENT_DELETED: "INCIDENT_DELETED",
  INCIDENT_LINKED: "INCIDENT_LINKED",
  AI_SUGGESTION_GENERATED: "AI_SUGGESTION_GENERATED",
  AI_SUGGESTION_DECIDED: "AI_SUGGESTION_DECIDED",
} as const;

export type ActivityAction = (typeof ACTIVITY_ACTION)[keyof typeof ACTIVITY_ACTION];

/**
 * Service Tier levels
 */
export const SERVICE_TIERS = [1, 2, 3] as const;
export type ServiceTier = (typeof SERVICE_TIERS)[number];

/**
 * AI Suggestion and Lifecycle Types
 */
export const AI_STATUS = {
  NONE: "none",
  PENDING: "pending",
  READY: "ready",
  FAILED: "failed",
  UNAVAILABLE: "unavailable",
} as const;
export type AiStatus = (typeof AI_STATUS)[keyof typeof AI_STATUS];

export const AI_SUGGESTION_TYPE = {
  TRIAGE: "triage",
  SUMMARY: "summary",
  POSTMORTEM: "postmortem",
  DUPLICATE: "duplicate",
  CLARIFY: "clarify",
  STATUS_DRAFT: "statusDraft",
  ALERT_GROUP: "alert_group",
  RUNBOOK: "runbook",
  ASSISTANT: "assistant",
} as const;
export type AiSuggestionType = (typeof AI_SUGGESTION_TYPE)[keyof typeof AI_SUGGESTION_TYPE];

export interface AssistantQueryResponse {
  aiAvailable: boolean;
  reason?: string;
  answer?: string;
  sources?: string[];
  label?: "AI-generated";
}

export interface OrganizationAiSettings {
  alertGrouping: boolean;
  runbooks: boolean;
  assistant: boolean;
  alertGroupingWindowMinutes: number;
  alertGroupingSimilarityThreshold: number;
}

export const ALERT_STATUS = {
  OPEN: "open",
  GROUPED: "grouped",
  DISMISSED: "dismissed",
} as const;
export type AlertStatus = (typeof ALERT_STATUS)[keyof typeof ALERT_STATUS];

export interface SuggestedRunbookItem {
  id?: string;
  title: string;
  url: string;
  tags: string[];
  serviceId?: string | null;
  score: number;
  reason: string;
  explanation?: string;
}

export interface RunbookSuggestionsResult {
  aiAvailable: boolean;
  reason?: string;
  suggestionId?: string;
  runbooks: SuggestedRunbookItem[];
}

export const AI_USER_DECISION = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  EDITED: "edited",
  DISMISSED: "dismissed",
} as const;
export type AiUserDecision = (typeof AI_USER_DECISION)[keyof typeof AI_USER_DECISION];

export const AI_PROVIDERS = {
  FAKE: "fake",
  GROQ: "groq",
  GEMINI: "gemini",
  OLLAMA: "ollama",
} as const;
export type AiProviderType = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];

/**
 * Embedded AI sub-document for an incident
 */
export interface IncidentAiSubdocument {
  severity?: IncidentPriority | null;
  reason?: string | null;
  confidence?: number | null;
  model?: string | null;
  provider?: string | null;
  suggestedService?: string | null;
  suggestedTeam?: string | null;
  summary?: string | null;
  summaryUpdatedAt?: Date | null;
  status: AiStatus;
}

/**
 * In-App Notification Types
 */
export const NOTIFICATION_TYPES = {
  INCIDENT_ASSIGNED: "INCIDENT_ASSIGNED",
  INCIDENT_STATUS_CHANGED: "INCIDENT_STATUS_CHANGED",
  INCIDENT_PRIORITY_CHANGED: "INCIDENT_PRIORITY_CHANGED",
  INCIDENT_COMMENT_ADDED: "INCIDENT_COMMENT_ADDED",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

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
  warning?: string;
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
