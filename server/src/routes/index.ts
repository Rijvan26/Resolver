import { Router } from "express";
import authRoutes from "./authRoutes";
import invitationRoutes from "./invitationRoutes";
import organizationRoutes from "./organizationRoutes";
import incidentRoutes from "./incidentRoutes";
import dashboardRoutes from "./dashboardRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/invitations", invitationRoutes);
router.use("/organizations", organizationRoutes);
router.use("/incidents", incidentRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
