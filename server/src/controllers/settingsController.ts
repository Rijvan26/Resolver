import { Request, Response, NextFunction } from "express";
import { organizationDao } from "../dao/organizationDao";
import { aiSuggestionDao } from "../dao/aiSuggestionDao";
import { config } from "../config/config";
import { NotFoundError } from "../utils/errors";

export class SettingsController {
  /**
   * Canonical GET /api/v1/settings
   * Returns organization profile, features, AI toggles, thresholds, and operational telemetry.
   * STRICT ZERO SECRET LEAKAGE: Never returns API keys or raw tokens.
   */
  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const org = await organizationDao.findById(organizationId);
      if (!org) {
        throw new NotFoundError("Organization not found");
      }

      const todayAiCount = await aiSuggestionDao.countTodayByOrg(organizationId);

      res.status(200).json({
        success: true,
        data: {
          id: org._id.toString(),
          name: org.name,
          slug: org.slug,
          statusPageEnabled: org.statusPageEnabled,
          aiSettings: {
            alertGrouping: org.aiSettings?.alertGrouping ?? true,
            runbooks: org.aiSettings?.runbooks ?? true,
            assistant: org.aiSettings?.assistant ?? true,
            alertGroupingWindowMinutes: org.aiSettings?.alertGroupingWindowMinutes ?? 30,
            alertGroupingSimilarityThreshold: org.aiSettings?.alertGroupingSimilarityThreshold ?? 0.82,
          },
          aiTelemetry: {
            globalEnabled: Boolean(config.AI_ENABLED),
            activeProvider: config.AI_PROVIDER,
            activeModel: config.AI_MODEL,
            dailyCap: config.AI_DAILY_CAP,
            usedToday: todayAiCount,
          },
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Canonical PATCH /api/v1/settings
   * Restricted to SUPER_ADMIN and ADMIN. Validates every field strictly.
   */
  async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const { name, statusPageEnabled } = req.body;
      let aiSettings = req.body.aiSettings;

      // Support flat AI settings input if caller passed them directly
      if (!aiSettings && (
        req.body.alertGrouping !== undefined ||
        req.body.runbooks !== undefined ||
        req.body.assistant !== undefined ||
        req.body.alertGroupingWindowMinutes !== undefined ||
        req.body.alertGroupingSimilarityThreshold !== undefined
      )) {
        aiSettings = {
          ...(req.body.alertGrouping !== undefined && { alertGrouping: req.body.alertGrouping }),
          ...(req.body.runbooks !== undefined && { runbooks: req.body.runbooks }),
          ...(req.body.assistant !== undefined && { assistant: req.body.assistant }),
          ...(req.body.alertGroupingWindowMinutes !== undefined && { alertGroupingWindowMinutes: req.body.alertGroupingWindowMinutes }),
          ...(req.body.alertGroupingSimilarityThreshold !== undefined && { alertGroupingSimilarityThreshold: req.body.alertGroupingSimilarityThreshold }),
        };
      }

      // Update fields using organizationDao
      const updatePayload: Record<string, unknown> = {};
      if (name !== undefined) updatePayload.name = name;
      if (statusPageEnabled !== undefined) updatePayload.statusPageEnabled = statusPageEnabled;
      if (aiSettings !== undefined) updatePayload.aiSettings = aiSettings;

      const updated = await organizationDao.updateById(organizationId, updatePayload);
      if (!updated) {
        throw new NotFoundError("Organization not found");
      }

      const todayAiCount = await aiSuggestionDao.countTodayByOrg(organizationId);

      res.status(200).json({
        success: true,
        message: "Settings updated successfully",
        data: {
          id: updated._id.toString(),
          name: updated.name,
          slug: updated.slug,
          statusPageEnabled: updated.statusPageEnabled,
          aiSettings: {
            alertGrouping: updated.aiSettings?.alertGrouping ?? true,
            runbooks: updated.aiSettings?.runbooks ?? true,
            assistant: updated.aiSettings?.assistant ?? true,
            alertGroupingWindowMinutes: updated.aiSettings?.alertGroupingWindowMinutes ?? 30,
            alertGroupingSimilarityThreshold: updated.aiSettings?.alertGroupingSimilarityThreshold ?? 0.82,
          },
          aiTelemetry: {
            globalEnabled: Boolean(config.AI_ENABLED),
            activeProvider: config.AI_PROVIDER,
            activeModel: config.AI_MODEL,
            dailyCap: config.AI_DAILY_CAP,
            usedToday: todayAiCount,
          },
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const settingsController = new SettingsController();
export default settingsController;
