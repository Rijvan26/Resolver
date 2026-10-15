import { Router } from "express";
import authRoutes from "./authRoutes";
import invitationRoutes from "./invitationRoutes";
import organizationRoutes from "./organizationRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/invitations", invitationRoutes);
router.use("/organizations", organizationRoutes);

export default router;
