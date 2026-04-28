/**
 * Tipagem do ambiente do Worker hmadv-api.
 * Todos os bindings declarados no wrangler.toml e secrets esperados.
 */
export interface Env {
  // ── Bindings ──────────────────────────────────────────────────────────────
  DB: D1Database;
  CLOUDFLARE_DOCS_KV: KVNamespace;
  COPILOT_ATTACHMENTS_BUCKET: R2Bucket;
  AI: Ai;

  // ── Variáveis públicas ────────────────────────────────────────────────────
  SITE_URL: string;
  CLOUDFLARE_WORKERS_AI_MODEL: string;

  // ── Supabase ──────────────────────────────────────────────────────────────
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;

  // ── Google Calendar ───────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REFRESH_TOKEN?: string;
  GOOGLE_ACCESS_TOKEN?: string;

  // ── Email ─────────────────────────────────────────────────────────────────
  RESEND_API_KEY?: string;

  // ── Freshchat ─────────────────────────────────────────────────────────────
  FRESHCHAT_API_BASE?: string;
  FRESHCHAT_API_KEY?: string;
  FRESHCHAT_JWT_SECRET?: string;
  FRESHCHAT_ENABLE_WEB_MESSENGER?: string;
  FRESHCHAT_WIDGET_SCRIPT_URL?: string;
  FRESHCHAT_WEB_MESSENGER_TOKEN?: string;
  FRESHCHAT_WEB_MESSENGER_HOST?: string;

  // ── Freshsales ────────────────────────────────────────────────────────────
  FRESHSALES_API_BASE?: string;
  FRESHSALES_API_KEY?: string;
  FRESHSALES_ACCESS_TOKEN?: string;
  FRESHSALES_CONTACT_LIFECYCLE_FIELD?: string;
  FRESHSALES_CONTACT_MEETING_FIELD?: string;
  FRESHSALES_CONTACT_NEGOTIATION_FIELD?: string;
  FRESHSALES_CONTACT_CLOSING_FIELD?: string;
  FRESHSALES_CONTACT_CLIENT_FIELD?: string;
  FRESHSALES_STAGE_VALUE_MAP?: string;
  FRESHSALES_ACTIVITY_TYPE_BY_EVENT?: string;
  FRESHSALES_APPOINTMENT_FIELD_MAP?: string;

  // ── Freshdesk ─────────────────────────────────────────────────────────────
  FRESHDESK_DOMAIN?: string;
  FRESHDESK_BASIC_TOKEN?: string;

  // ── Integrações internas ──────────────────────────────────────────────────
  HMADV_RUNNER_TOKEN?: string;
  FREDDY_ACTION_SHARED_SECRET?: string;
  PROCESS_AI_BASE?: string;
  HMDAV_AI_SHARED_SECRET?: string;
  HMADV_AI_SHARED_SECRET?: string;

  // ── Slack ─────────────────────────────────────────────────────────────────
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_SIGNING_SECRET?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_ACCESS_TOKEN?: string;
  SLACK_USER_TOKEN?: string;
  SLACK_WEBHOOK_URL?: string;

  // ── Zoom ──────────────────────────────────────────────────────────────────
  ZOOM_ACCOUNT_ID?: string;
  ZOOM_CLIENT_ID?: string;
  ZOOM_CLIENT_SECRET?: string;
  ZOOM_USER_ID?: string;
  ZOOM_DEFAULT_TIMEZONE?: string;

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  WHATSAPP_PROVIDER?: string;
  WHATSAPP_CLOUD_API_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_CLOUD_API_VERSION?: string;
}
