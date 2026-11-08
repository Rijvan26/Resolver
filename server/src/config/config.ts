import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file
dotenv.config();

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
  INVITATION_BASE_URL: z.string().default("http://localhost:5173/accept-invitation"),
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
});

const parsedEnv = envSchema.safeParse(process.env);

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
