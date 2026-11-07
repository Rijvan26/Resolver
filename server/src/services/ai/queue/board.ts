import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Router } from "express";
import { getAiQueue } from "./bullmq";
import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { ROLES } from "../../../types";

/**
 * Bull Board Dashboard:
 * Provides an interactive web UI for inspecting and monitoring background jobs
 * in the `ai-jobs` queue (Active, Waiting, Completed, Failed, Delayed).
 *
 * Security:
 * Strictly gated behind authentication and role authorization: SUPER_ADMIN and ADMIN only.
 */
export function createBullBoardRouter(): Router {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  const queue = getAiQueue();

  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter,
  });

  const router = Router();

  // Protect Bull Board with Super Admin / Admin RBAC
  router.use(
    "/admin/queues",
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
    serverAdapter.getRouter()
  );

  return router;
}
