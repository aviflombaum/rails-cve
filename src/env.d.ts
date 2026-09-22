interface Env {
  ENCRYPTION_KEY: string;
  ADMIN_TOKEN: string;
  SIGNUPS_ENABLED?: string;
  VERIFICATIONS_ENABLED?: string;
  DELIVERY_ENABLED?: string;
  EGRESS_PROXY_URL?: string;
  EGRESS_PROXY_TOKEN?: string;
  GITHUB_TOKEN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  EMAIL?: SendEmail;
  EMAIL_FROM?: string;
  EMAIL_TRANSPORT?: "smtp" | "cloudflare" | "disabled";
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
}
