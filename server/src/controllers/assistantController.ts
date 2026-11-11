import { Request, Response, NextFunction } from "express";
import { assistantService } from "../services/ai/assistant/assistantService";
import { ApiSuccessResponse, AssistantQueryResponse, Role } from "../types";

export class AssistantController {
  /**
   * POST /assistant/query and POST /api/v1/assistant/query
   * Natural-language read-only assistant query over allowlisted tools.
   */
  async query(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const userId = req.user!.userId;
      const userRole = (req.user!.role as Role) || "DEVELOPER";
      const { question } = req.body;

      const result = await assistantService.queryAssistant(
        organizationId,
        userId,
        userRole,
        question
      );

      const response: ApiSuccessResponse<AssistantQueryResponse> = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const assistantController = new AssistantController();
export default assistantController;

