import { Router } from "express";
import authRoutes from "./authRoutes";
import invitationRoutes from "./invitationRoutes";
import organizationRoutes from "./organizationRoutes";
import incidentRoutes from "./incidentRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/invitations", invitationRoutes);
router.use("/organizations", organizationRoutes);
router.use("/incidents", incidentRoutes);

export default router;
