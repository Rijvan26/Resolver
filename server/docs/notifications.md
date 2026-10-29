# Resolver — Notifications & Background Jobs Documentation

## 1. Overview
The **Notifications & Background Jobs** module provides a production-minded in-app notification infrastructure and resilient background event delivery pipeline for **Resolver**, an organization-based multi-tenant incident management platform.

---

## 2. Notification Model & Data Design

### 2.1 Model Schema (`src/models/Notification.ts`)
| Field | Type | Description |
|---|---|---|
| `_id` | `ObjectId` | Unique notification identifier |
| `organizationId` | `ObjectId` (ref: Organization) | Tenant organization context (strictly required) |
| `recipientId` | `ObjectId` (ref: User) | Target recipient receiving the notification |
| `actorId` | `ObjectId` (ref: User) | User responsible for triggering the notification (null if system) |
| `incidentId` | `ObjectId` (ref: Incident) | Associated incident record |
| `type` | `String` (Enum) | Strict notification type enum |
| `title` | `String` (1-200 chars) | Summary title |
| `message` | `String` (1-1000 chars) | Detailed notification content |
| `readAt` | `Date \| null` | Read timestamp (null indicates unread) |
| `metadata` | `Record<string, unknown>` | Structured contextual data (e.g., old/new status, comment ID) |
| `createdAt` | `Date` | Timestamp of creation |
| `updatedAt` | `Date` | Timestamp of last modification |

### 2.2 Strict Notification Types (`src/types/index.ts`)
- `INCIDENT_ASSIGNED`: Triggered when an incident is assigned or reassigned to an active member.
- `INCIDENT_STATUS_CHANGED`: Triggered when an incident's status transitions (e.g. `OPEN` → `IN_PROGRESS`).
- `INCIDENT_PRIORITY_CHANGED`: Triggered when an incident's priority level is altered (e.g. `LOW` → `CRITICAL`).
- `INCIDENT_COMMENT_ADDED`: Triggered when a new comment is posted on an incident.

### 2.3 Compound Database Indexes
The following indexes support high-throughput, low-latency tenant-isolated queries:
1. `{ organizationId: 1, recipientId: 1, readAt: 1, createdAt: -1 }`: Unread count, unread-filtered lists, and sorting.
2. `{ organizationId: 1, recipientId: 1, createdAt: -1 }`: User's chronological notification feed.
3. `{ organizationId: 1, recipientId: 1, _id: 1 }`: Single-document tenant-safe lookups and read updates.
4. `{ organizationId: 1, incidentId: 1, type: 1, recipientId: 1 }`: Event idempotency and duplicate deduplication.

---

## 3. API Reference

All notification endpoints require authentication via Bearer JWT token (`Authorization: Bearer <token>`). The user's `userId` and `organizationId` are derived strictly from the verified authentication context. Cross-organization and cross-user data leakage is strictly prohibited.

### 3.1 List Notifications
- **Method / Endpoint**: `GET /api/v1/notifications`
- **Query Parameters**:
  - `page` (optional integer, min 1, default 1)
  - `limit` (optional integer, min 1, max 100, default 20)
  - `unread` (optional boolean, `true` / `false`)
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "673f84e8a8b12c001f3e9b01",
        "organizationId": "673f84e8a8b12c001f3e9a01",
        "recipientId": "673f84e8a8b12c001f3e9a02",
        "actor": {
          "id": "673f84e8a8b12c001f3e9a03",
          "name": "Jane Doe",
          "email": "jane@acme.com",
          "role": "ADMIN"
        },
        "incident": {
          "id": "673f84e8a8b12c001f3e9a05",
          "title": "API Gateway 502 Outage",
          "status": "OPEN",
          "priority": "CRITICAL"
        },
        "type": "INCIDENT_ASSIGNED",
        "title": "Incident Assigned",
        "message": "You have been assigned to incident \"API Gateway 502 Outage\"",
        "readAt": null,
        "isRead": false,
        "metadata": {
          "incidentId": "673f84e8a8b12c001f3e9a05",
          "newAssigneeId": "673f84e8a8b12c001f3e9a02"
        },
        "createdAt": "2026-10-29T08:45:00.000Z",
        "updatedAt": "2026-10-29T08:45:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    },
    "unreadCount": 1
  }
}
```

### 3.2 Get Unread Notification Count
- **Method / Endpoint**: `GET /api/v1/notifications/unread-count`
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "unreadCount": 1
  }
}
```

### 3.3 Mark Single Notification as Read
- **Method / Endpoint**: `PATCH /api/v1/notifications/:notificationId/read`
- **URL Parameters**: `notificationId` (24-char hex ObjectId)
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": {
    "id": "673f84e8a8b12c001f3e9b01",
    "isRead": true,
    "readAt": "2026-10-29T08:50:00.000Z"
  }
}
```
- **Error Responses**:
  - `404 Not Found`: If notification ID does not exist or belongs to another user / organization.

### 3.4 Mark All Notifications as Read
- **Method / Endpoint**: `PATCH /api/v1/notifications/read-all`
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "3 notification(s) marked as read",
  "data": {
    "message": "3 notification(s) marked as read",
    "modifiedCount": 3
  }
}
```

---

## 4. Business Event Rules & Recipient Selection

| Event | Recipients | Business Logic Rules |
|---|---|---|
| **Incident Created with Assignee** | New Assignee | - No self-notification if assignee is creator.<br>- Recipient must be an active member of the organization.<br>- Dispatches background email notification. |
| **Incident Reassigned** | New Assignee | - No-op if assignee did not change (`newAssigneeId === oldAssigneeId`).<br>- No notification if incident is unassigned (`newAssigneeId === null`).<br>- No self-notification if actor reassigns to themselves.<br>- Recipient must be active in organization. |
| **Incident Status Changed** | Assignee & Creator | - No-op if status did not change (`newStatus === oldStatus`).<br>- Actor is excluded (no self-notification).<br>- Only active members of the organization receive notifications. |
| **Incident Priority Changed** | Assignee & Creator | - No-op if priority did not change (`newPriority === oldPriority`).<br>- Actor is excluded (no self-notification).<br>- Only active members receive notifications. |
| **Comment Added** | Assignee & Creator | - Comment author is excluded (no self-notification).<br>- Truncates long comment excerpts cleanly in notification text. |

---

## 5. Reliability, Deduplication & Delivery Guarantees

1. **Non-blocking Dispatch**:
   - Notifications and background jobs are executed after the core business transaction has successfully completed.
   - If a database issue or network transient occurs during notification generation, it is logged with full context and does **not** fail or roll back the caller's successful incident or comment update.
2. **Idempotency & Deduplication**:
   - `notificationDao.findRecentDuplicate()` checks for duplicate event firings within a short sliding window, preventing duplicate records from client retries or repeated webhook triggers.
3. **Email Delivery & Bounded Retries**:
   - `emailDeliveryService` handles email dispatch with exponential backoff up to 3 bounded retry attempts.
   - Credentials, passwords, and tokens are **never** logged. Emails are masked (`u***r@domain.com`).
   - In environments without an active SMTP provider, the service logs a safe skip notice (`SKIPPED_NO_PROVIDER`) and records status cleanly without discarding jobs silently.

---

## 6. Environment Configuration Requirements

To enable production email delivery via SMTP, configure the following documented environment variables:
```bash
# Production SMTP Provider (Optional)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
EMAIL_FROM="Resolver Notifications <notifications@resolver.internal>"
```

