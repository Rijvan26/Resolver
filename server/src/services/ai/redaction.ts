/**
 * Options for configuring redaction behavior
 */
export interface RedactionOptions {
  /**
   * Whether to redact IPv4 and IPv6 addresses. Defaults to true.
   */
  redactIps?: boolean;
  /**
   * Whether to redact email addresses. Defaults to true.
   */
  redactEmails?: boolean;
  /**
   * Whether to redact phone numbers. Defaults to true.
   */
  redactPhones?: boolean;
  /**
   * Whether to redact passwords, tokens, and API keys. Defaults to true.
   */
  redactSecrets?: boolean;
  /**
   * Whether to redact credit card / payment card numbers. Defaults to true.
   */
  redactCards?: boolean;
}

/**
 * Common regular expressions for sensitive pattern detection and sanitization
 */
const PATTERNS = {
  // Private Key blocks (PEM format)
  privateKey: /-----BEGIN[ A-Z_-]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z_-]*PRIVATE KEY-----/gi,

  // JWT Tokens (3 base64url encoded parts separated by periods)
  jwt: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,

  // Known cloud/service API keys
  awsKey: /\bAKIA[0-9A-Z]{16}\b/g,
  githubToken: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,
  stripeKey: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,}\b/g,
  slackToken: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/g,
  sendgridKey: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g,

  // Authorization headers and Bearer / Basic tokens
  bearerToken: /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*\b/gi,

  // Key-value pairs containing password, secret, token, api_key, api-key, etc. (supports both bare and JSON quoted keys)
  keyValueSecret:
    /(["']?(?:password|passwd|pwd|secret|token|api_?key|auth_?token|access_?token|client_?secret|private_?key)["']?\s*[:=]\s*["']?)([^"'\r\n,;}{]+)(["']?)/gi,

  // Email addresses (RFC 5322 simplified)
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,

  // Credit card numbers (13 to 19 digits formatted with optional spaces or dashes)
  creditCard: /\b(?:\d[ -]*?){13,19}\b/g,

  // Phone numbers (international E.164, North American, UK, etc.)
  phone:
    /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?/gi,
  internationalPhone: /(?:^|[\s(])\+(?:[0-9][\s.-]?){7,15}[0-9](?:$|[\s).,;])/g,

  // IPv4 Addresses (0.0.0.0 to 255.255.255.255)
  ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,

  // IPv6 Addresses
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
};

/**
 * Pure function: Redacts sensitive secrets, passwords, tokens, API keys, emails,
 * phone numbers, and IP addresses before text is sent to an external AI provider.
 *
 * Guarantees:
 * - Pure function (no network, zero async)
 * - Safe against prompt injection leakage of sensitive system secrets
 * - Minimizes external provider exposure
 */
export function redact(text: string, options?: RedactionOptions): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  const {
    redactIps = true,
    redactEmails = true,
    redactPhones = true,
    redactSecrets = true,
    redactCards = true,
  } = options || {};

  let sanitized = text;

  // 1. Redact Secrets & Keys (highest priority to avoid partial email/phone matching inside secrets)
  if (redactSecrets) {
    // PEM private keys
    sanitized = sanitized.replace(PATTERNS.privateKey, "[REDACTED_PRIVATE_KEY]");

    // Specific vendor API keys
    sanitized = sanitized.replace(PATTERNS.awsKey, "[REDACTED_API_KEY]");
    sanitized = sanitized.replace(PATTERNS.githubToken, "[REDACTED_TOKEN]");
    sanitized = sanitized.replace(PATTERNS.stripeKey, "[REDACTED_API_KEY]");
    sanitized = sanitized.replace(PATTERNS.slackToken, "[REDACTED_TOKEN]");
    sanitized = sanitized.replace(PATTERNS.sendgridKey, "[REDACTED_API_KEY]");

    // JWT tokens
    sanitized = sanitized.replace(PATTERNS.jwt, "[REDACTED_JWT_TOKEN]");

    // Authorization Bearer/Basic headers
    sanitized = sanitized.replace(PATTERNS.bearerToken, "[REDACTED_AUTH_HEADER]");

    // Key-value pairs: password="...", "password": "...", token=...
    sanitized = sanitized.replace(
      PATTERNS.keyValueSecret,
      (_match, prefix, _value, suffix) => `${prefix}[REDACTED_SECRET]${suffix}`
    );
  }

  // 2. Redact Payment Cards
  if (redactCards) {
    sanitized = sanitized.replace(PATTERNS.creditCard, (match) => {
      const digitsOnly = match.replace(/[\s-]/g, "");
      // Only redact if 13-19 continuous digits (valid card length)
      if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && /^\d+$/.test(digitsOnly)) {
        return "[REDACTED_CARD]";
      }
      return match;
    });
  }

  // 3. Redact Email Addresses
  if (redactEmails) {
    sanitized = sanitized.replace(PATTERNS.email, "[REDACTED_EMAIL]");
  }

  // 4. Redact Phone Numbers
  if (redactPhones) {
    sanitized = sanitized.replace(PATTERNS.internationalPhone, (match) => {
      // Preserve leading space or bracket
      const leadingChar = /^[\s(]/.test(match) ? match[0] : "";
      const trailingChar = /[\s).,;]$/.test(match) ? match[match.length - 1] : "";
      return `${leadingChar}[REDACTED_PHONE]${trailingChar}`;
    });
    sanitized = sanitized.replace(PATTERNS.phone, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 15) {
        return "[REDACTED_PHONE]";
      }
      return match;
    });
  }

  // 5. Redact IP Addresses
  if (redactIps) {
    sanitized = sanitized.replace(PATTERNS.ipv4, "[REDACTED_IP]");
    sanitized = sanitized.replace(PATTERNS.ipv6, "[REDACTED_IP]");
  }

  return sanitized;
}

export default redact;
