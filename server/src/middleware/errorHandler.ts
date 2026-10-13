import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";
import { config } from "../config/config";
import { ApiErrorResponse } from "../types";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedDetails = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: formattedDetails,
      },
    };
    res.status(400).json(response);
    return;
  }

  // 2. Known Operational App Errors
  if (err instanceof AppError) {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // 3. Mongoose Duplicate Key Error (E11000)
  if ((err as { code?: number }).code === 11000) {
    const keyValue = (err as unknown as { keyValue?: Record<string, unknown> }).keyValue;
    const duplicateField = keyValue ? Object.keys(keyValue)[0] : "field";
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: "DUPLICATE_RESOURCE",
        message: `A record with that ${duplicateField} already exists.`,
      },
    };
    res.status(409).json(response);
    return;
  }

  // 4. Mongoose Validation Errors
  if (err.name === "ValidationError") {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err.message,
      },
    };
    res.status(400).json(response);
    return;
  }

  // 5. JWT Errors
  if (err.name === "JsonWebTokenError") {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid or malformed token",
      },
    };
    res.status(401).json(response);
    return;
  }

  if (err.name === "TokenExpiredError") {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: "TOKEN_EXPIRED",
        message: "Authentication token has expired",
      },
    };
    res.status(401).json(response);
    return;
  }

  // 6. Malformed JSON Body
  if (err instanceof SyntaxError && "body" in err) {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Malformed JSON payload provided",
      },
    };
    res.status(400).json(response);
    return;
  }

  // 7. Unhandled / Internal Server Error
  if (config.NODE_ENV !== "test") {
    console.error("💥 Unhandled Error:", err);
  }

  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected internal server error occurred.",
      // Never leak stack traces in production
      ...(config.NODE_ENV === "development" ? { details: err.message } : {}),
    },
  };

  res.status(500).json(response);
};

export default errorHandler;
