import { Router } from "express";
import authRoutes from "./authRoutes";
import invitationRoutes from "./invitationRoutes";
import organizationRoutes from "./organizationRoutes";
import incidentRoutes from "./incidentRoutes";
import dashboardRoutes from "./dashboardRoutes";
import notificationRoutes from "./notificationRoutes";
import aiRoutes from "./aiRoutes";
import reportRoutes from "./reportRoutes";
import alertRoutes from "./alertRoutes";
import assistantRoutes from "./assistantRoutes";
import settingsRoutes from "./settingsRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/invitations", invitationRoutes);
router.use("/organizations", organizationRoutes);
router.use("/incidents", incidentRoutes);
router.use("/alerts", alertRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);
router.use("/ai", aiRoutes);
router.use("/reports", reportRoutes);
router.use("/assistant", assistantRoutes);
router.use("/settings", settingsRoutes);

export default router;
