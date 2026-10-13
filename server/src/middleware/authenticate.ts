import { Request, Response, NextFunction } from "express";
import { AuthenticationError } from "../utils/errors";
import { verifyAccessToken } from "../utils/tokenUtils";

/**
 * Authentication middleware that verifies the Bearer access token in the Authorization header
 * and attaches typed user context and organizationId to the Express Request object.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
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

    // Attach verified user and organization identity to request
    req.user = payload;
    req.organizationId = payload.organizationId;

    next();
  } catch (error) {
    next(error);
  }
};

export default authenticate;
