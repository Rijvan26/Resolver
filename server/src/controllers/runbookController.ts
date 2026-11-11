import { Request, Response, NextFunction } from "express";
import { runbookService } from "../services/runbookService";

export class RunbookController {
  /**
   * GET /api/v1/incidents/:id/ai/runbooks
   * Get top 3 suggested runbooks for an incident (FR-11)
   */
  async getSuggestedRunbooks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const incidentId = (req.params.incidentId || req.params.id) as string;

      const result = await runbookService.suggestRunbooks(incidentId, organizationId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/incidents/:id/ai/runbooks/feedback
   * Record human feedback (Useful / Not useful) on suggested runbooks
   */
  async recordRunbookFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const userId = req.user!.userId;
      const suggestionId = req.body.suggestionId;
      const feedback = req.body.feedback as "useful" | "not_useful";

      const success = await runbookService.recordFeedback(
        suggestionId,
        organizationId,
        feedback,
        userId
      );

      res.status(200).json({
        success,
        message: feedback === "useful" ? "Marked as useful" : "Marked as not useful",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const runbookController = new RunbookController();
export default runbookController;

