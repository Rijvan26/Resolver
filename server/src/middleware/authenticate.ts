import { Request, Response, NextFunction } from "express";
import { AuthenticationError } from "../utils/errors";
import { verifyAccessToken } from "../utils/tokenUtils";
import { userDao } from "../dao/userDao";

/**
 * Authentication middleware that verifies the Bearer access token in the Authorization header,
 * ensures the user exists and is active in the database,
 * and attaches typed user context and organizationId to the Express Request object.
 */
export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError("Authorization header is missing");
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new AuthenticationError("Authorization format must be 'Bearer <token>'");
    }

    const token = parts[1];
    if (!token) {
      throw new AuthenticationError("Access token is missing");
    }

    const payload = verifyAccessToken(token);

    // Verify user exists and is currently active in the database (revokes access immediately on deactivation)
    const user = await userDao.findById(payload.userId);
    if (!user) {
      throw new AuthenticationError("User account no longer exists");
    }

    if (!user.isActive) {
      throw new AuthenticationError("Account is deactivated. Please contact your administrator.");
    }

    // Attach verified user and organization identity to request (using current role from DB)
    req.user = {
      userId: user._id.toString(),
      organizationId: user.organizationId.toString(),
      role: user.role,
      email: user.email,
    };
    req.organizationId = user.organizationId.toString();

    next();
  } catch (error) {
    next(error);
  }
};

export default authenticate;
