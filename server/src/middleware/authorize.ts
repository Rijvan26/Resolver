import { Request, Response, NextFunction } from "express";
import { Role } from "../types";
import { AuthenticationError, ForbiddenError } from "../utils/errors";

/**
 * Middleware factory for role-based authorization.
 * Accepts one or more permitted roles.
 * Requires an authenticated user (req.user).
 * Returns 401 AuthenticationError if unauthenticated.
 * Returns 403 ForbiddenError if user's role is not permitted.
 */
export const authorize = (...permittedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError("Authentication required");
      }

      if (permittedRoles.length > 0 && !permittedRoles.includes(req.user.role)) {
        throw new ForbiddenError("Access denied: insufficient permissions");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default authorize;
