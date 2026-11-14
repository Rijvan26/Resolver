import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { config } from "../config/config";

export interface EmailDeliveryPayload {
  to: string;
  recipientName?: string;
  subject: string;
  text: string;
  html?: string;
  metadata?: Record<string, unknown>;
}

export interface EmailDeliveryResult {
  success: boolean;
  status: "SENT" | "SKIPPED_NO_PROVIDER" | "FAILED";
  messageId?: string;
  error?: string;
  attempts: number;
}

export type EmailSender = (payload: EmailDeliveryPayload) => Promise<{ messageId: string }>;

export class EmailDeliveryService {
  private customSender: EmailSender | null = null;
  private transporter: Transporter | null = null;
  private liveInTest: boolean = false;
  private maxRetries: number = 3;
  private baseBackoffMs: number = 200;

  constructor() {
    this.initTransporter();
  }

  /**
   * Initialize Nodemailer SMTP transporter from environment configuration.
   */
  public initTransporter(): void {
    const user = config.BREVO_SMTP_USER?.trim();
    const pass = config.BREVO_SMTP_PASS?.trim();

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host: config.SMTP_HOST || "smtp-relay.brevo.com",
        port: config.SMTP_PORT || 587,
        secure: config.SMTP_PORT === 465,
        auth: {
          user,
          pass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
    } else {
      this.transporter = null;
    }
  }

  /**
   * For testing or injecting a mock sender.
   */
  public setSender(sender: EmailSender | null): void {
    this.customSender = sender;
  }

  /**
   * For testing or manually resetting transporter.
   */
  public setTransporter(transporter: Transporter | null): void {
    this.transporter = transporter;
  }

  /**
   * For testing: explicitly allow live delivery even when NODE_ENV === 'test'.
   */
  public setLiveInTest(enabled: boolean): void {
    this.liveInTest = enabled;
  }

  /**
   * Verify SMTP credentials and server connectivity.
   */
  async verifyConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.transporter) {
      return {
        success: false,
        message: "No SMTP transporter configured. Please set BREVO_SMTP_USER and BREVO_SMTP_PASS.",
      };
    }
    try {
      await this.transporter.verify();
      return {
        success: true,
        message: "Brevo SMTP server connection and authentication successful",
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Brevo SMTP verification failed: ${msg}`,
      };
    }
  }

  /**
   * Extracts clean email address from "Name <email@domain>" or raw email.
   */
  private parseSenderEmail(raw: string): string {
    const match = raw.match(/<([^>]+)>/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return raw.trim();
  }

  /**
   * Send transactional email using Brevo HTTP API over HTTPS (port 443).
   * Used for cloud environments like Render where outbound SMTP ports (25/465/587) are blocked.
   */
  public async sendViaBrevoHttp(payload: EmailDeliveryPayload): Promise<{ messageId: string }> {
    const apiKey = (process.env.EMAIL_API_KEY || config.EMAIL_API_KEY || config.BREVO_API_KEY || process.env.BREVO_API_KEY)?.trim();
    if (!apiKey) {
      throw new Error("Brevo API key is not configured. Set EMAIL_API_KEY in environment variables.");
    }

    const rawFrom = process.env.EMAIL_FROM || config.EMAIL_FROM || config.GOOGLE_USER?.trim() || "notifications@resolver.internal";
    const senderEmail = this.parseSenderEmail(rawFrom);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          "accept": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "Resolver",
            email: senderEmail,
          },
          to: [
            {
              email: payload.to,
            },
          ],
          subject: payload.subject,
          htmlContent: payload.html || `<p>${payload.text}</p>`,
          textContent: payload.text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorDetails = "";
        try {
          const errJson = (await response.json()) as { message?: string; code?: string };
          errorDetails = errJson?.message || errJson?.code || JSON.stringify(errJson);
        } catch {
          errorDetails = await response.text().catch(() => "Unknown response body");
        }
        console.error(
          `❌ [EmailDeliveryService] Brevo HTTP API error (HTTP ${response.status}): ${errorDetails}`
        );
        throw new Error(`Brevo HTTP API delivery failed with status ${response.status}: ${errorDetails}`);
      }

      const data = (await response.json().catch(() => ({}))) as { messageId?: string; messageIds?: string[] };
      const messageId = data?.messageId || data?.messageIds?.[0] || "brevo-http-msg";
      return { messageId };
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError" || (err as Error)?.message?.includes("aborted")) {
        console.error("❌ [EmailDeliveryService] Brevo HTTP API request timed out after 10000ms");
        throw new Error("Brevo HTTP API request timed out after 10000ms");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Send transactional email using Nodemailer SMTP transporter.
   */
  private async sendViaSmtp(payload: EmailDeliveryPayload): Promise<{ messageId: string }> {
    if (!this.transporter) {
      throw new Error("SMTP transporter is not initialized. Check BREVO_SMTP_USER and BREVO_SMTP_PASS.");
    }
    const rawFrom = config.GOOGLE_USER?.trim() || config.EMAIL_FROM;
    const from = rawFrom.includes("<") ? rawFrom : `Resolver <${rawFrom}>`;
    const info = await this.transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return { messageId: info.messageId };
  }

  /**
   * Send an email with bounded retries and exponential backoff.
   * Never exposes credentials or sensitive payload tokens in error logs.
   */
  async sendEmail(payload: EmailDeliveryPayload): Promise<EmailDeliveryResult> {
    const isLiveAllowed = config.NODE_ENV !== "test" || this.liveInTest;
    let activeSender: EmailSender | null = this.customSender;

    if (!activeSender && isLiveAllowed) {
      if (config.EMAIL_PROVIDER === "brevo") {
        activeSender = (p: EmailDeliveryPayload) => this.sendViaBrevoHttp(p);
      } else if (config.EMAIL_PROVIDER === "smtp") {
        if (this.transporter) {
          activeSender = (p: EmailDeliveryPayload) => this.sendViaSmtp(p);
        } else {
          // Fallback to Brevo HTTP if API key is present
          const apiKey = (config.EMAIL_API_KEY || config.BREVO_API_KEY || process.env.EMAIL_API_KEY || process.env.BREVO_API_KEY)?.trim();
          if (apiKey) {
            activeSender = (p: EmailDeliveryPayload) => this.sendViaBrevoHttp(p);
          }
        }
      }
    }

    // If in test mode with no mock sender and live not allowed, safely skip
    if (!activeSender) {
      if (config.NODE_ENV === "test") {
        return {
          success: true,
          status: "SKIPPED_NO_PROVIDER",
          attempts: 0,
        };
      }

      const warnMsg = "No email provider configured or EMAIL_API_KEY is missing";
      console.warn(`⚠️ [EmailDeliveryService] ${warnMsg}. Email to ${this.maskEmail(payload.to)} skipped.`);
      return {
        success: false,
        status: "FAILED",
        error: warnMsg,
        attempts: 0,
      };
    }

    let lastError: Error | null = null;

    // Attempt delivery with bounded retries & exponential backoff
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await activeSender(payload);
        return {
          success: true,
          status: "SENT",
          messageId: result.messageId,
          attempts: attempt,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          const delay = this.baseBackoffMs * Math.pow(2, attempt - 1);
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    // Safe error reporting (never leak tokens, passwords or secrets)
    const safeErrorMessage = lastError ? lastError.message : "Unknown email delivery error";
    console.error(
      `❌ [EmailDeliveryService] Failed to deliver email to ${this.maskEmail(payload.to)} after ${this.maxRetries} attempts: ${safeErrorMessage}`
    );

    return {
      success: false,
      status: "FAILED",
      error: safeErrorMessage,
      attempts: this.maxRetries,
    };
  }

  /**
   * Safe email masking for privacy and log sanitization.
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!local || !domain) return "***";
    const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : `${local[0]}***`;
    return `${maskedLocal}@${domain}`;
  }
}

export const emailDeliveryService = new EmailDeliveryService();
export default emailDeliveryService;
