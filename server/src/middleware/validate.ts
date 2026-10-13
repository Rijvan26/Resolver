import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

type RequestLocation = "body" | "query" | "params";

/**
 * Reusable middleware factory for validating Express request data with Zod schemas.
 * Replaces req[location] with parsed and normalized data upon success.
 */
export const validate = (schema: ZodSchema, location: RequestLocation = "body") => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req[location]);
      req[location] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(error);
      } else {
        next(error);
      }
    }
  };
};

export default validate;
