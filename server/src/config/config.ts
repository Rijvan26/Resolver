import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file (supports running from root or server dir)
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "server", ".env") });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().default("http://localhost:5000"),
  MONGODB_URI: z.string().default("mongodb://localhost:27017/resolver"),
  DB_CONNECT_MAX_RETRIES: z.coerce.number().default(5),
  DB_CONNECT_RETRY_DELAY_MS: z.coerce.number().default(8000), // 8 seconds
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters long"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters long"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  COOKIE_SECRET: z.string().min(16, "COOKIE_SECRET must be at least 16 characters long"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  CLIENT_URL: z.string().optional(),
  INVITATION_BASE_URL: z.string().default("http://localhost:5173/accept-invitation"),
  EMAIL_PROVIDER: z.enum(["brevo", "smtp"]).default("brevo"),
  EMAIL_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().default("smtp-relay.brevo.com"),
  SMTP_PORT: z.coerce.number().default(587),
  BREVO_SMTP_USER: z.string().optional(),
  BREVO_SMTP_PASS: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  GOOGLE_USER: z.string().optional(),
  EMAIL_FROM: z.string().default("Resolver Notifications <notifications@resolver.internal>"),

  // Redis & BullMQ Configuration
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // AI Phase 1 & 2 Configuration (SRS-AI-001)
  AI_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1")
    .default(false),
  AI_PROVIDER: z.enum(["fake", "groq", "gemini", "ollama"]).default("fake"),
  AI_MODEL: z.string().default("qwen/qwen3.8-27b"),
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OLLAMA_HOST: z.string().default("http://localhost:11434"),
  AI_TIMEOUT_MS: z.coerce.number().default(30000),
  AI_DAILY_CAP: z.coerce.number().default(50),
  AI_REDACT_IPS: z
    .string()
    .optional()
    .transform((val) => val !== "false" && val !== "0")
    .default(true),

  // Embedding Configuration (Phase 2)
  EMBEDDING_PROVIDER: z.enum(["fake", "gemini", "ollama"]).default("fake"),
  EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  EMBEDDING_DIM: z.coerce.number().default(768),
  EMBEDDING_BATCH_SIZE: z.coerce.number().default(10),

  // Similar Incidents Configuration (FR-07)
  AI_SIMILAR_THRESHOLD: z.coerce.number().default(0.6),
  AI_SIMILAR_SERVICE_BOOST: z.coerce.number().default(0.05),

  // Duplicate Detection Configuration (FR-06)
  AI_DUPLICATE_THRESHOLD: z.coerce.number().default(0.70),
  AI_DUPLICATE_WINDOW_HOURS: z.coerce.number().default(24),

  // Alert Grouping Configuration (FR-08)
  AI_ALERT_GROUPING_ENABLED: z
    .string()
    .optional()
    .transform((val) => val !== "false" && val !== "0")
    .default(true),
  AI_ALERT_GROUPING_WINDOW_MINUTES: z.coerce.number().default(30),
  AI_ALERT_GROUPING_SIMILARITY_THRESHOLD: z.coerce.number().default(0.82),

  // Runbook Suggestions Configuration (FR-11)
  AI_RUNBOOK_ENABLED: z
    .string()
    .optional()
    .transform((val) => val !== "false" && val !== "0")
    .default(true),
  AI_RUNBOOK_EXPLANATION_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1")
    .default(false),

  // Assistant Configuration (FR-10)
  AI_ASSISTANT_ENABLED: z
    .string()
    .optional()
    .transform((val) => val !== "false" && val !== "0")
    .default(true),

  // Cookies & Reverse Proxy Configuration
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).optional(),

  // Alert Ingest Security & Flood Protection (Hardening)
  ALERT_INGEST_SECRET: z
    .string()
    .default("resolver_alert_ingest_secret_token_default_32chars"),
  ALERT_FLOOD_INCIDENT_CAP: z.coerce.number().default(10),
  ALERT_FLOOD_WINDOW_MINUTES: z.coerce.number().default(10),
  ALERT_RATE_LIMIT_MAX: z.coerce.number().default(120),
});

const DEFAULT_DEV_INGEST_SECRET = "resolver_alert_ingest_secret_token_default_32chars";

const isLocalhostUrl = (url: string): boolean => {
  const lower = url.toLowerCase();
  return lower.includes("localhost") || lower.includes("127.0.0.1");
};

export const productionEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (!env.ALERT_INGEST_SECRET || env.ALERT_INGEST_SECRET === DEFAULT_DEV_INGEST_SECRET || env.ALERT_INGEST_SECRET.length < 16) {
    ctx.addIssue({
      code: "custom",
      path: ["ALERT_INGEST_SECRET"],
      message: "ALERT_INGEST_SECRET must be explicitly set to a strong secret (>= 16 chars) in production",
    });
  }

  if (!env.MONGODB_URI || isLocalhostUrl(env.MONGODB_URI)) {
    ctx.addIssue({
      code: "custom",
      path: ["MONGODB_URI"],
      message: "MONGODB_URI must point to a remote production cluster (not localhost) in production",
    });
  }

  if (!env.REDIS_URL || isLocalhostUrl(env.REDIS_URL)) {
    ctx.addIssue({
      code: "custom",
      path: ["REDIS_URL"],
      message: "REDIS_URL must point to Upstash / remote Redis (not localhost) in production",
    });
  }

  const effectiveCors = env.CLIENT_URL || env.CORS_ORIGIN;
  if (!effectiveCors || isLocalhostUrl(effectiveCors)) {
    ctx.addIssue({
      code: "custom",
      path: ["CORS_ORIGIN"],
      message: "CORS_ORIGIN (or CLIENT_URL) must be set to your production frontend origin (not localhost) in production",
    });
  }

  const effectiveInviteUrl = env.CLIENT_URL || env.INVITATION_BASE_URL;
  if (!effectiveInviteUrl || isLocalhostUrl(effectiveInviteUrl)) {
    ctx.addIssue({
      code: "custom",
      path: ["INVITATION_BASE_URL"],
      message: "CLIENT_URL (or INVITATION_BASE_URL) must be set to your production frontend URL (not localhost) in production",
    });
  }

  if (!env.APP_URL || isLocalhostUrl(env.APP_URL)) {
    ctx.addIssue({
      code: "custom",
      path: ["APP_URL"],
      message: "APP_URL must be set to your production backend URL in production",
    });
  }
});

export function validateEnv(rawEnv: Record<string, string | undefined>) {
  return productionEnvSchema.safeParse(rawEnv);
}

const parsedEnv = validateEnv(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment configuration:");
  parsedEnv.error.issues.forEach((issue) => {
    console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
  });
  process.exit(1);
}

export const config = parsedEnv.data;
export type Config = z.infer<typeof envSchema>;
export default config;
