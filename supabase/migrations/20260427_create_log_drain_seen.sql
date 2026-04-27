-- Migration: log_drain_seen
-- Tabela de deduplicação para o slack-log-drain
-- Evita repostar o mesmo erro no Slack

CREATE TABLE IF NOT EXISTS log_drain_seen (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id      text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index para limpeza por data
CREATE INDEX IF NOT EXISTS log_drain_seen_created_at_idx ON log_drain_seen (created_at);

-- RLS desabilitado (acesso apenas via service_role)
ALTER TABLE log_drain_seen DISABLE ROW LEVEL SECURITY;

-- Limpeza automática de registros com mais de 1 hora (via cron externo ou TTL)
-- Registros antigos são ignorados pela query (cutoff de 30min na função)
