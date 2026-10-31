/**
 * Core Domain Enums & Constants
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

export const INCIDENT_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
} as const;

export type IncidentStatus = (typeof INCIDENT_STATUS)[keyof typeof INCIDENT_STATUS];

export const INCIDENT_PRIORITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;

export type IncidentPriority = (typeof INCIDENT_PRIORITY)[keyof typeof INCIDENT_PRIORITY];

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
} as const;

export type ActivityAction = (typeof ACTIVITY_ACTION)[keyof typeof ACTIVITY_ACTION];

export const NOTIFICATION_TYPES = {
  INCIDENT_ASSIGNED: "INCIDENT_ASSIGNED",
  INCIDENT_STATUS_CHANGED: "INCIDENT_STATUS_CHANGED",
  INCIDENT_PRIORITY_CHANGED: "INCIDENT_PRIORITY_CHANGED",
  INCIDENT_COMMENT_ADDED: "INCIDENT_COMMENT_ADDED",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const INVITATION_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REVOKED: "REVOKED",
} as const;

export type InvitationStatus = (typeof INVITATION_STATUS)[keyof typeof INVITATION_STATUS];

/**
 * API Response Envelopes
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | string | unknown;
  };
  requestId?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Domain Models
 */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  statusPageEnabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  organizationId: string;
  createdBy: UserSummary;
  assignee?: UserSummary | null;
  assigneeId?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedIncidents {
  incidents: Incident[];
  pagination: Pagination;
}

export type IncidentSortField = "createdAt" | "updatedAt" | "title" | "priority" | "status";
export type IncidentSortOrder = "asc" | "desc";

export interface ListIncidentsParams {
  page?: number;
  limit?: number;
  status?: IncidentStatus;
  priority?: IncidentPriority;
  assigneeId?: string;
  search?: string;
  sortBy?: IncidentSortField;
  sortOrder?: IncidentSortOrder;
}

export interface CreateIncidentPayload {
  title: string;
  description: string;
  status?: IncidentStatus;
  priority?: IncidentPriority;
  assigneeId?: string | null;
}

export interface UpdateIncidentPayload {
  title?: string;
  description?: string;
  status?: IncidentStatus;
  priority?: IncidentPriority;
}

export interface UpdateAssigneePayload {
  assigneeId: string | null;
}

export interface Comment {
  id: string;
  incidentId: string;
  organizationId: string;
  author: UserSummary;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedComments {
  comments: Comment[];
  pagination: Pagination;
}

export interface ActivityItem {
  id: string;
  incidentId: string;
  organizationId: string;
  actor: UserSummary;
  action: ActivityAction;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PaginatedTimeline {
  timeline: ActivityItem[];
  pagination: Pagination;
}

export interface NotificationItem {
  id: string;
  organizationId: string;
  recipientId: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  incident: {
    id: string;
    title: string;
    status: IncidentStatus;
    priority: IncidentPriority;
  } | null;
  type: NotificationType;
  title: string;
  message: string;
  readAt: string | null;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedNotifications {
  notifications: NotificationItem[];
  pagination: Pagination;
  unreadCount: number;
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
  inviterId?: string;
  inviter?: {
    id: string;
    name: string;
    email: string;
  };
  invitationLink?: string;
  invitationToken?: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedMembers {
  members: Member[];
  pagination: Pagination;
}

export interface OverviewStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  criticalUnresolved: number;
  createdInRange: number;
  resolvedInRange: number;
}

export interface DailyTrendEntry {
  date: string;
  created: number;
  resolved: number;
}

export interface TeamMemberWorkload {
  member: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  open: number;
  inProgress: number;
  totalUnresolved: number;
}

export interface RecentActivityItem {
  id: string;
  action: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role?: Role;
  };
  incident?: {
    id: string;
    title: string;
    status: IncidentStatus;
    priority: IncidentPriority;
  } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PaginatedRecentActivity {
  activities: RecentActivityItem[];
  pagination: Pagination;
}

export interface IncidentsByStatusData {
  statusCounts: Record<IncidentStatus, number>;
  total: number;
}

export interface IncidentsByPriorityData {
  priorityCounts: Record<IncidentPriority, number>;
  total: number;
}

export interface IncidentTrendsData {
  trends: DailyTrendEntry[];
  startDate: string;
  endDate: string;
}

export interface TeamWorkloadData {
  teamWorkload: TeamMemberWorkload[];
  totalMembers: number;
}

export interface DashboardDateRangeParams {
  startDate?: string;
  endDate?: string;
}

export interface RecentActivityParams {
  page?: number;
  limit?: number;
}


