import { z } from "zod";
import { Types } from "mongoose";
import { incidentDao } from "../../../dao/incidentDao";
import { serviceDao } from "../../../dao/serviceDao";
import { INCIDENT_STATUS, Role, IncidentPriority } from "../../../types";

export interface ToolContext {
  organizationId: string;
  userId: string;
  role: Role;
}

export interface ToolDefinition<TArgs = any> {
  name: string;
  description: string;
  parameters: z.ZodType<TArgs>;
  execute: (args: TArgs, context: ToolContext) => Promise<unknown>;
}

/**
 * FIXED ALLOWLIST OF READ-ONLY TOOLS
 * Strictly read-only operations wrapping existing DAOs and services.
 * NO write tools. NO raw database access. NO free-form queries.
 */
export const ASSISTANT_TOOLS: Record<string, ToolDefinition> = {
  list_open_incidents: {
    name: "list_open_incidents",
    description: "Lists active or open incidents in the organization with their priority, status, and service.",
    parameters: z.object({
      limit: z.number().int().min(1).max(20).optional().default(10),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    }),
    execute: async (args: { limit?: number; priority?: IncidentPriority }, context: ToolContext) => {
      const limit = args.limit || 10;
      const filter: Record<string, unknown> = {
        status: INCIDENT_STATUS.OPEN,
      };
      if (args.priority) {
        filter.priority = args.priority;
      }

      const docs = await incidentDao.findIncidentsByOrg(context.organizationId, filter, { limit });
      return docs.map((doc) => {
        const s = doc.serviceId as any;
        return {
          id: doc._id.toString(),
          title: doc.title,
          priority: doc.priority,
          status: doc.status,
          serviceName: s?.name || "Unassigned",
          createdAt: doc.createdAt,
        };
      });
    },
  },

  get_incident: {
    name: "get_incident",
    description: "Retrieves details of a specific incident by ID, including title, description, priority, and service.",
    parameters: z.object({
      incidentId: z.string().trim().min(1, "incidentId is required"),
    }),
    execute: async (args: { incidentId: string }, context: ToolContext) => {
      if (!Types.ObjectId.isValid(args.incidentId)) {
        return { error: `Invalid incident ID format: ${args.incidentId}` };
      }
      const doc = await incidentDao.findByOrgAndId(context.organizationId, args.incidentId);
      if (!doc) {
        return { error: `Incident not found with ID ${args.incidentId}` };
      }
      const s = doc.serviceId as any;
      const u = doc.assigneeId as any;
      return {
        id: doc._id.toString(),
        title: doc.title,
        description: doc.description,
        status: doc.status,
        priority: doc.priority,
        service: s ? { id: s._id?.toString(), name: s.name, tier: s.tier } : null,
        assignee: u ? { id: u._id?.toString(), name: u.name, email: u.email } : null,
        alertCount: doc.alertCount || 1,
        createdAt: doc.createdAt,
        resolvedAt: doc.resolvedAt || null,
      };
    },
  },

  find_incidents_by_service: {
    name: "find_incidents_by_service",
    description: "Finds incidents associated with a specific service name in the organization.",
    parameters: z.object({
      serviceName: z.string().trim().min(1, "serviceName is required"),
      limit: z.number().int().min(1).max(20).optional().default(10),
    }),
    execute: async (args: { serviceName: string; limit?: number }, context: ToolContext) => {
      const limit = args.limit || 10;
      const service = await serviceDao.findByName(context.organizationId, args.serviceName);
      if (!service) {
        return {
          incidents: [],
          message: `Service "${args.serviceName}" not found in organization.`,
        };
      }

      const docs = await incidentDao.findIncidentsByOrg(
        context.organizationId,
        { serviceId: service._id } as any,
        { limit }
      );
      return docs.map((doc) => ({
        id: doc._id.toString(),
        title: doc.title,
        priority: doc.priority,
        status: doc.status,
        serviceName: service.name,
        createdAt: doc.createdAt,
      }));
    },
  },

  get_service: {
    name: "get_service",
    description: "Retrieves service details by service name or ID, including tier, owning team, and runbooks.",
    parameters: z
      .object({
        serviceName: z.string().trim().optional(),
        serviceId: z.string().trim().optional(),
      })
      .refine((data) => data.serviceName || data.serviceId, {
        message: "Either serviceName or serviceId must be provided",
      }),
    execute: async (args: { serviceName?: string; serviceId?: string }, context: ToolContext) => {
      let service = null;
      if (args.serviceId && Types.ObjectId.isValid(args.serviceId)) {
        service = await serviceDao.findByOrgAndId(context.organizationId, args.serviceId);
      } else if (args.serviceName) {
        service = await serviceDao.findByName(context.organizationId, args.serviceName);
      }

      if (!service) {
        return { error: `Service not found` };
      }

      return {
        id: service._id.toString(),
        name: service.name,
        tier: service.tier,
        owningTeam: service.owningTeam,
        runbookLinks: service.runbookLinks || [],
      };
    },
  },

  get_oncall: {
    name: "get_oncall",
    description: "Retrieves on-call schedule or current on-call responder for a service.",
    parameters: z.object({
      serviceName: z.string().trim().optional(),
    }),
    execute: async (_args: { serviceName?: string }, _context: ToolContext) => {
      // Per audit and requirements: Resolver has no on-call rotation model.
      // Explicitly return structured unavailability message ("I don't have that data") rather than hallucinating.
      return {
        onCallAvailable: false,
        message: "I don't have that data: No on-call rotation schedule is configured in Resolver.",
      };
    },
  },
};

/**
 * List of allowed tool names for rapid allowlist validation
 */
export const ALLOWLISTED_TOOL_NAMES = Object.keys(ASSISTANT_TOOLS);

