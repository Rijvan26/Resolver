import { Router } from "express";
import authRoutes from "./authRoutes";
import invitationRoutes from "./invitationRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/invitations", invitationRoutes);

export default router;
