import { Request, Response, NextFunction } from "express";
import { authService } from "../services/authService";
import { config } from "../config/config";
import { ApiSuccessResponse } from "../types";

const REFRESH_COOKIE_NAME = "refreshToken";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AuthController {
  /**
   * POST /api/v1/auth/register-organization
   */
  async registerOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.registerOrganization(req.body);

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Organization and administrator account registered successfully",
        data: result,
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);

      // Set secure HttpOnly cookie for refresh token
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        signed: true,
        maxAge: COOKIE_MAX_AGE_MS,
      });

      const response: ApiSuccessResponse<{
        accessToken: string;
        refreshToken: string;
        user: typeof result.user;
        organization: typeof result.organization;
      }> = {
        success: true,
        message: "Authentication successful",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Prioritize signed HttpOnly cookie, fallback to request body for non-browser clients
      const rawToken =
        (req.signedCookies && req.signedCookies[REFRESH_COOKIE_NAME]) ||
        (req.body && req.body.refreshToken);

      const tokens = await authService.refreshSession(rawToken);

      // Set rotated refresh token cookie
      res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        signed: true,
        maxAge: COOKIE_MAX_AGE_MS,
      });

      const response: ApiSuccessResponse<typeof tokens> = {
        success: true,
        message: "Session refreshed successfully",
        data: tokens,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawToken =
        (req.signedCookies && req.signedCookies[REFRESH_COOKIE_NAME]) ||
        (req.body && req.body.refreshToken);

      await authService.logout(rawToken);

      res.clearCookie(REFRESH_COOKIE_NAME);

      const response: ApiSuccessResponse<null> = {
        success: true,
        message: "Logged out successfully",
        data: null,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/me
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.getMe(req.user!.userId, req.user!.organizationId);

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
export default authController;
