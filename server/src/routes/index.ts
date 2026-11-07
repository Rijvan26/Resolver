import { Router } from "express";
import authRoutes from "./authRoutes";
import invitationRoutes from "./invitationRoutes";
import organizationRoutes from "./organizationRoutes";
import incidentRoutes from "./incidentRoutes";
import dashboardRoutes from "./dashboardRoutes";
import notificationRoutes from "./notificationRoutes";
import aiRoutes from "./aiRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/invitations", invitationRoutes);
router.use("/organizations", organizationRoutes);
router.use("/incidents", incidentRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);
router.use("/ai", aiRoutes);

export default router;
