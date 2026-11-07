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

  // AI Phase 1 Configuration (SRS-AI-001)
  AI_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1")
    .default(false),
  AI_PROVIDER: z.enum(["fake", "groq", "gemini", "ollama"]).default("fake"),
  AI_MODEL: z.string().default("llama-3.3-70b-versatile"),
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
