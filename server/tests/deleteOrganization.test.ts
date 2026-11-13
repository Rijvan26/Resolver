import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { ROLES } from "../src/types";
import { generateAccessToken } from "../src/utils/tokenUtils";
import { hashPassword } from "../src/utils/passwordUtils";
import { Organization } from "../src/models/Organization";
import { User } from "../src/models/User";
import { Incident } from "../src/models/Incident";
import { Service } from "../src/models/Service";
import { Alert } from "../src/models/Alert";
import { Comment } from "../src/models/Comment";
import { Activity } from "../src/models/Activity";
import { Invitation } from "../src/models/Invitation";
import { Notification } from "../src/models/Notification";
import { Runbook } from "../src/models/Runbook";
import { AiSuggestion } from "../src/models/AiSuggestion";
import { IncidentEmbedding } from "../src/models/IncidentEmbedding";
import { RefreshToken } from "../src/models/RefreshToken";
import { OrganizationDeletionAudit } from "../src/models/OrganizationDeletionAudit";

describe("Organization Deletion & Cascade Clean-up API", () => {
  const SUPER_PASSWORD = "StrongSuperPassword123!";
  let passwordHash: string;

  beforeAll(async () => {
    await setupTestDb();
    passwordHash = await hashPassword(SUPER_PASSWORD);
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  }, 30000);

  beforeEach(async () => {
    await clearTestDb();
  });

  // Helper to bootstrap an organization with multi-role users and seed cross-collection data
  const setupTargetAndOtherOrg = async () => {
    // 1. Primary/Other Organization (Preserved)
    const otherOrg = await organizationDao.create({
      name: "Acme Main Corp",
      slug: "acme-main-corp",
    });

    const otherSuperAdmin = await userDao.create({
      name: "Primary Super Admin",
      email: "primary.super@acme-main.com",
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      organizationId: otherOrg._id,
      isActive: true,
    });

    const otherToken = generateAccessToken({
      userId: otherSuperAdmin._id.toString(),
      organizationId: otherOrg._id.toString(),
      role: ROLES.SUPER_ADMIN,
      email: otherSuperAdmin.email,
    });

    const otherIncident = await Incident.create({
      title: "Other Incident",
      description: "Should not be touched",
      status: "OPEN",
      priority: "HIGH",
      organizationId: otherOrg._id,
      createdBy: otherSuperAdmin._id,
    });

    // 2. Target Organization to be deleted
    const targetOrg = await organizationDao.create({
      name: "Staging Throwaway Inc",
      slug: "staging-throwaway-inc",
    });

    const targetSuperAdmin = await userDao.create({
      name: "Throwaway Super Admin",
      email: "throwaway.super@staging.com",
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      organizationId: targetOrg._id,
      isActive: true,
    });

    const targetAdmin = await userDao.create({
      name: "Throwaway Admin",
      email: "throwaway.admin@staging.com",
      passwordHash,
      role: ROLES.ADMIN,
      organizationId: targetOrg._id,
      isActive: true,
    });

    const targetDeveloper = await userDao.create({
      name: "Throwaway Developer",
      email: "throwaway.dev@staging.com",
      passwordHash,
      role: ROLES.DEVELOPER,
      organizationId: targetOrg._id,
      isActive: true,
    });

    const targetSuperToken = generateAccessToken({
      userId: targetSuperAdmin._id.toString(),
      organizationId: targetOrg._id.toString(),
      role: ROLES.SUPER_ADMIN,
      email: targetSuperAdmin.email,
    });

    const targetAdminToken = generateAccessToken({
      userId: targetAdmin._id.toString(),
      organizationId: targetOrg._id.toString(),
      role: ROLES.ADMIN,
      email: targetAdmin.email,
    });

    const targetDevToken = generateAccessToken({
      userId: targetDeveloper._id.toString(),
      organizationId: targetOrg._id.toString(),
      role: ROLES.DEVELOPER,
      email: targetDeveloper.email,
    });

    // Seed items across all collections linked to targetOrg
    const service = await Service.create({
      name: "Auth Microservice",
      tier: 1,
      owningTeam: "Security Team",
      organizationId: targetOrg._id,
    });

    const incident = await Incident.create({
      title: "Auth Gateway Down",
      description: "Gateway returning 502",
      status: "OPEN",
      priority: "CRITICAL",
      organizationId: targetOrg._id,
      createdBy: targetSuperAdmin._id,
      serviceId: service._id,
    });

    const alert = await Alert.create({
      title: "CPU Spike",
      description: "CPU exceeded 95%",
      severity: "CRITICAL",
      source: "Datadog",
      fingerprint: "cpu-95-auth",
      organizationId: targetOrg._id,
      serviceId: service._id,
      incidentId: incident._id,
    });

    const comment = await Comment.create({
      incidentId: incident._id,
      organizationId: targetOrg._id,
      authorId: targetSuperAdmin._id,
      content: "Investigating the crash log now.",
    });

    const activity = await Activity.create({
      organizationId: targetOrg._id,
      incidentId: incident._id,
      actorId: targetSuperAdmin._id,
      action: "INCIDENT_CREATED",
      metadata: { priority: "CRITICAL" },
    });

    const invitation = await Invitation.create({
      organizationId: targetOrg._id,
      email: "pending.hire@staging.com",
      role: ROLES.DEVELOPER,
      inviterId: targetSuperAdmin._id,
      tokenHash: "dummyhash1234567890",
      expiresAt: new Date(Date.now() + 86400000),
      status: "PENDING",
    });

    const notification = await Notification.create({
      organizationId: targetOrg._id,
      recipientId: targetAdmin._id,
      type: "INCIDENT_ASSIGNED",
      title: "New Incident Assigned",
      message: "Gateway down",
    });

    const runbook = await Runbook.create({
      title: "Gateway Restart Playbook",
      url: "https://wiki.internal/gateway",
      organizationId: targetOrg._id,
      serviceId: service._id,
    });

    const aiSuggestion = await AiSuggestion.create({
      incidentId: incident._id,
      organizationId: targetOrg._id,
      type: "triage",
      inputHash: "abc123hash",
      output: { suggestedSeverity: "CRITICAL" },
      model: "gemini-1.5",
      provider: "google",
      latencyMs: 120,
      status: "ready",
      userDecision: "pending",
    });

    const incidentEmbedding = await IncidentEmbedding.create({
      incidentId: incident._id,
      organizationId: targetOrg._id,
      vector: [0.1, 0.2, 0.3],
      model: "text-embedding-3",
      provider: "openai",
      dim: 3,
      textHash: "embeddinghash123",
    });

    const refreshToken = await RefreshToken.create({
      userId: targetSuperAdmin._id,
      organizationId: targetOrg._id,
      tokenHash: "refreshhash123",
      family: "family-1",
      expiresAt: new Date(Date.now() + 86400000),
    });

    return {
      otherOrg,
      otherSuperAdmin,
      otherToken,
      otherIncident,
      targetOrg,
      targetSuperAdmin,
      targetAdmin,
      targetDeveloper,
      targetSuperToken,
      targetAdminToken,
      targetDevToken,
      seededItems: {
        service,
        incident,
        alert,
        comment,
        activity,
        invitation,
        notification,
        runbook,
        aiSuggestion,
        incidentEmbedding,
        refreshToken,
      },
    };
  };

  it("1. should reject unauthenticated requests with 401", async () => {
    const { targetOrg } = await setupTargetAndOtherOrg();

    const previewRes = await request(app).get(`/api/v1/organizations/${targetOrg._id}/delete-preview`);
    expect(previewRes.status).toBe(401);

    const deleteRes = await request(app)
      .delete(`/api/v1/organizations/${targetOrg._id}`)
      .send({ organizationName: targetOrg.name, password: SUPER_PASSWORD });
    expect(deleteRes.status).toBe(401);
  });

  it("2. should reject non-superadmin users (ADMIN, DEVELOPER) with 403 Forbidden", async () => {
    const { targetOrg, targetAdminToken, targetDevToken } = await setupTargetAndOtherOrg();

    // Admin attempt
    const adminPreviewRes = await request(app)
      .get(`/api/v1/organizations/${targetOrg._id}/delete-preview`)
      .set("Authorization", `Bearer ${targetAdminToken}`);
    expect(adminPreviewRes.status).toBe(403);

    const adminDeleteRes = await request(app)
      .delete(`/api/v1/organizations/${targetOrg._id}`)
      .set("Authorization", `Bearer ${targetAdminToken}`)
      .send({ organizationName: targetOrg.name, password: SUPER_PASSWORD });
    expect(adminDeleteRes.status).toBe(403);

    // Developer attempt
    const devDeleteRes = await request(app)
      .delete(`/api/v1/organizations/${targetOrg._id}`)
      .set("Authorization", `Bearer ${targetDevToken}`)
      .send({ organizationName: targetOrg.name, password: SUPER_PASSWORD });
    expect(devDeleteRes.status).toBe(403);
  });

  it("3. should return accurate collection counts and no personal data on delete-preview", async () => {
    const { targetOrg, targetSuperToken } = await setupTargetAndOtherOrg();

    const res = await request(app)
      .get(`/api/v1/organizations/${targetOrg._id}/delete-preview`)
      .set("Authorization", `Bearer ${targetSuperToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organizationId).toBe(targetOrg._id.toString());
    expect(res.body.data.organizationName).toBe(targetOrg.name);

    const counts = res.body.data.counts;
    expect(counts.members).toBe(3); // superAdmin, admin, developer
    expect(counts.incidents).toBe(1);
    expect(counts.services).toBe(1);
    expect(counts.alerts).toBe(1);
    expect(counts.comments).toBe(1);
    expect(counts.activities).toBe(1);
    expect(counts.invitations).toBe(1);
    expect(counts.notifications).toBe(1);
    expect(counts.runbooks).toBe(1);
    expect(counts.aiSuggestions).toBe(1);
    expect(counts.incidentEmbeddings).toBe(1);
    expect(counts.refreshTokens).toBe(1);
    expect(res.body.data.totalRecords).toBeGreaterThanOrEqual(14);

    // Ensure no personal data is leaked
    const jsonStr = JSON.stringify(res.body.data);
    expect(jsonStr).not.toContain("password");
    expect(jsonStr).not.toContain("throwaway.super@staging.com");
    expect(jsonStr).not.toContain("Throwaway Super Admin");
  });

  it("4. should reject deletion when organization name confirmation is incorrect", async () => {
    const { targetOrg, targetSuperToken } = await setupTargetAndOtherOrg();

    const res = await request(app)
      .delete(`/api/v1/organizations/${targetOrg._id}`)
      .set("Authorization", `Bearer ${targetSuperToken}`)
      .send({
        organizationName: "Wrong Organization Name",
        password: SUPER_PASSWORD,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("mismatch");
  });

  it("5. should reject deletion when password re-authentication fails", async () => {
    const { targetOrg, targetSuperToken } = await setupTargetAndOtherOrg();

    const res = await request(app)
      .delete(`/api/v1/organizations/${targetOrg._id}`)
      .set("Authorization", `Bearer ${targetSuperToken}`)
      .send({
        organizationName: targetOrg.name,
        password: "IncorrectPassword999!",
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("Invalid password");
  });

  it("6. should prevent platform lockout when deleting the only remaining superadmin organization", async () => {
    // Create an isolated single organization with 1 superadmin and no other orgs
    const loneOrg = await organizationDao.create({
      name: "Only Organization",
      slug: "only-org",
    });

    const loneSuper = await userDao.create({
      name: "Lone Super",
      email: "lone@only-org.com",
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      organizationId: loneOrg._id,
      isActive: true,
    });

    const loneToken = generateAccessToken({
      userId: loneSuper._id.toString(),
      organizationId: loneOrg._id.toString(),
      role: ROLES.SUPER_ADMIN,
      email: loneSuper.email,
    });

    const res = await request(app)
      .delete(`/api/v1/organizations/${loneOrg._id}`)
      .set("Authorization", `Bearer ${loneToken}`)
      .send({
        organizationName: loneOrg.name,
        password: SUPER_PASSWORD,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("leave no active Super Admins on the platform");
  });

  it("7. should cascade delete all organization data across collections and preserve other organizations", async () => {
    const {
      otherOrg,
      otherIncident,
      otherSuperAdmin,
      targetOrg,
      targetSuperToken,
    } = await setupTargetAndOtherOrg();

    const deleteRes = await request(app)
      .delete(`/api/v1/organizations/${targetOrg._id}`)
      .set("Authorization", `Bearer ${targetSuperToken}`)
      .send({
        organizationName: targetOrg.name,
        password: SUPER_PASSWORD,
      });

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
    expect(deleteRes.body.data.totalRecordsDeleted).toBeGreaterThanOrEqual(14);

    // 1. Verify target organization is deleted
    const deletedOrg = await Organization.findById(targetOrg._id);
    expect(deletedOrg).toBeNull();

    // 2. Verify all child collections for target organization are empty
    expect(await User.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await Incident.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await Service.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await Alert.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await Comment.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await Activity.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await Invitation.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await Notification.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await Runbook.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await AiSuggestion.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await IncidentEmbedding.countDocuments({ organizationId: targetOrg._id })).toBe(0);
    expect(await RefreshToken.countDocuments({ organizationId: targetOrg._id })).toBe(0);

    // 3. Verify OTHER organization and its resources are 100% UNTOUCHED
    const untouchedOrg = await Organization.findById(otherOrg._id);
    expect(untouchedOrg).not.toBeNull();
    expect(untouchedOrg?.name).toBe("Acme Main Corp");

    const untouchedUser = await User.findById(otherSuperAdmin._id);
    expect(untouchedUser).not.toBeNull();
    expect(untouchedUser?.email).toBe("primary.super@acme-main.com");

    const untouchedIncident = await Incident.findById(otherIncident._id);
    expect(untouchedIncident).not.toBeNull();

    // 4. Verify persistent audit log was created
    const auditRecord = await OrganizationDeletionAudit.findOne({ organizationId: targetOrg._id });
    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.organizationName).toBe("Staging Throwaway Inc");
    expect(auditRecord?.deletedBy.email).toBe("throwaway.super@staging.com");
    expect(auditRecord?.totalRecordsDeleted).toBeGreaterThanOrEqual(14);
    expect(auditRecord?.counts.users).toBe(3);
    expect(auditRecord?.counts.incidents).toBe(1);
  });

  it("8. should be safe and idempotent to retry after deletion", async () => {
    const { otherToken } = await setupTargetAndOtherOrg();

    // Attempting to delete a non-existent / already deleted organization ID returns 404
    const fakeId = "60c72b2f9b1d8b2bad000000";
    const res = await request(app)
      .delete(`/api/v1/organizations/${fakeId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({
        organizationName: "Non Existent Org",
        password: SUPER_PASSWORD,
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

