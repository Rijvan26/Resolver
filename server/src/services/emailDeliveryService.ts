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
   * For testing: explicitly allow live SMTP delivery even when NODE_ENV === 'test'.
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
   * Send an email with bounded retries and exponential backoff.
   * Never exposes credentials or sensitive payload tokens in error logs.
   */
  async sendEmail(payload: EmailDeliveryPayload): Promise<EmailDeliveryResult> {
    // 1. Determine active sender (custom mock or live Nodemailer transport)
    const isLiveAllowed = config.NODE_ENV !== "test" || this.liveInTest;
    const activeSender =
      this.customSender ||
      (this.transporter && isLiveAllowed
        ? async (p: EmailDeliveryPayload) => {
            const rawFrom = config.GOOGLE_USER?.trim() || config.EMAIL_FROM;
            const from = rawFrom.includes("<") ? rawFrom : `Resolver <${rawFrom}>`;
            const info = await this.transporter!.sendMail({
              from,
              to: p.to,
              subject: p.subject,
              text: p.text,
              html: p.html,
            });
            return { messageId: info.messageId };
          }
        : null);

    // 2. If no provider is configured and no mock is present, safely skip
    if (!activeSender) {
      if (config.NODE_ENV !== "test") {
        console.log(
          `📧 [EmailDeliveryService] No email provider configured. Notification email to ${this.maskEmail(payload.to)} skipped.`
        );
      }
      return {
        success: true,
        status: "SKIPPED_NO_PROVIDER",
        attempts: 0,
      };
    }

    let lastError: Error | null = null;

    // 3. Attempt delivery with bounded retries & exponential backoff
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

    // 4. Safe error reporting (never leak tokens, passwords or secrets)
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
