import { SerializedError } from "@reduxjs/toolkit";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { ApiErrorResponse } from "@/types";

export interface ParsedApiError {
  message: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Extracts human-readable error message and field-level validation errors
 * from an RTK Query mutation or query error.
 */
export function parseApiError(error: FetchBaseQueryError | SerializedError | unknown): ParsedApiError {
  if (!error) {
    return { message: "An unexpected error occurred. Please try again." };
  }

  // Handle FetchBaseQueryError
  if (typeof error === "object" && error !== null && "status" in error) {
    const fetchError = error as FetchBaseQueryError;

    // Handle network / timeout errors
    if (fetchError.status === "FETCH_ERROR") {
      return { message: "Network error: Unable to connect to Resolver server. Please check your connection." };
    }
    if (fetchError.status === "TIMEOUT_ERROR") {
      return { message: "Request timed out. Please try again." };
    }
    if (fetchError.status === "PARSING_ERROR") {
      return { message: "Failed to parse server response." };
    }

    // Handle structured backend ApiErrorResponse
    if (fetchError.data && typeof fetchError.data === "object") {
      const apiResponse = fetchError.data as ApiErrorResponse;
      if (apiResponse.error) {
        const fieldErrors: Record<string, string> = {};

        // If backend returned validation details array
        if (Array.isArray(apiResponse.error.details)) {
          apiResponse.error.details.forEach((item) => {
            if (item && typeof item === "object" && "field" in item && "message" in item) {
              const fieldKey = (item as { field: string }).field;
              fieldErrors[fieldKey] = (item as { message: string }).message;
            }
          });
        }

        return {
          message: apiResponse.error.message || "An error occurred while processing your request.",
          code: apiResponse.error.code,
          fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
        };
      }
    }

    // Handle HTTP status code fallbacks
    if (typeof fetchError.status === "number") {
      switch (fetchError.status) {
        case 400:
          return { message: "Invalid request. Please verify your submitted information." };
        case 401:
          return { message: "Authentication failed. Invalid email or password." };
        case 403:
          return { message: "You do not have permission to perform this action." };
        case 404:
          return { message: "The requested resource was not found." };
        case 409:
          return { message: "A conflict occurred with an existing resource." };
        case 429:
          return { message: "Too many requests. Please slow down and try again shortly." };
        case 500:
        default:
          return { message: "A server error occurred. Please try again later." };
      }
    }
  }

  // Handle SerializedError
  if (typeof error === "object" && error !== null && "message" in error) {
    const serialized = error as SerializedError;
    return { message: serialized.message || "An unexpected error occurred." };
  }

  return { message: "An unexpected error occurred. Please try again." };
}

