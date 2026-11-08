import crypto from "crypto";
import { redactSensitiveData } from "../redaction";
import { boundText } from "../prompts";

export interface IncidentEmbeddingTextInput {
  title: string;
  serviceName?: string | null;
  description: string;
  resolutionNotes?: string | null;
}

export interface PreparedEmbeddingText {
  text: string;
  textHash: string;
}

/**
 * Computes a SHA-256 hash for embedding text.
 */
export function hashEmbeddingText(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Prepares a concise, redacted string for incident embedding.
 * Includes: Title + Service + Short Description + Resolution Note (if any).
 * Never embeds raw logs, full stack traces, or secrets.
 * Capped to max 500 characters.
 */
export function buildIncidentEmbeddingText(
  input: IncidentEmbeddingTextInput
): PreparedEmbeddingText {
  const cleanTitle = boundText(redactSensitiveData(input.title || ""), 150);
  const cleanService = boundText(input.serviceName || "None", 50);
  const cleanDesc = boundText(redactSensitiveData(input.description || ""), 250);
  const cleanResolution = input.resolutionNotes
    ? boundText(redactSensitiveData(input.resolutionNotes), 150)
    : "";

  let combined = `Title: ${cleanTitle}\nService: ${cleanService}\nDescription: ${cleanDesc}`;
  if (cleanResolution) {
    combined += `\nResolution: ${cleanResolution}`;
  }

  // Final length guard
  const finalText = boundText(combined, 500);
  const textHash = hashEmbeddingText(finalText);

  return {
    text: finalText,
    textHash,
  };
}

