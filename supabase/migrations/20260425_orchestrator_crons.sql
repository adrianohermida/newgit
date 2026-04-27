-- ============================================================
-- Migração: CRONs do Orquestrador + Rebalanceamento
-- Data: 2026-04-25
-- Projeto: sspvizogbcyigquqycsz.supabase.co
-- ============================================================

-- Token de serviço (service_role)
-- eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcHZpem9nYmN5aWdxdXF5Y3N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjE1NiwiZXhwIjoyMDgzMzcyMTU2fQ.UkxycOBwslNeY5ABRn4_QmuvTpev3IrURYWA23_rUcc

-- ─────────────────────────────────────────────────────────────
-- 1. CRON PRINCIPAL: orchestrator-engine (a cada 5 minutos)
--    Maestro central que avalia filas e decide o que rodar
-- ─────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'orchestrator-engine-cron',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://sspvizogbcyigquqycsz.supabase.co/functions/v1/orchestrator-engine',
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcHZpem9nYmN5aWdxdXF5Y3N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjE1NiwiZXhwIjoyMDgzMzcyMTU2fQ.UkxycOBwslNeY5ABRn4_QmuvTpev3IrURYWA23_rUcc","Content-Type":"application/json"}'::jsonb,
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id$$
);

-- ─────────────────────────────────────────────────────────────
-- 2. CRON DE JOBS TRAVADOS: sync-health-monitor stuck (a cada 30 min)
--    Detecta e reseta automaticamente jobs travados
-- ─────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'sync-health-stuck-check',
  '*/30 * * * *',
  $$SELECT net.http_post(
    url := 'https://sspvizogbcyigquqycsz.supabase.co/functions/v1/sync-health-monitor',
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcHZpem9nYmN5aWdxdXF5Y3N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjE1NiwiZXhwIjoyMDgzMzcyMTU2fQ.UkxycOBwslNeY5ABRn4_QmuvTpev3IrURYWA23_rUcc","Content-Type":"application/json"}'::jsonb,
    body := '{"action":"stuck"}'::jsonb,
    timeout_milliseconds := 25000
  ) AS request_id$$
);

-- ─────────────────────────────────────────────────────────────
-- 3. CRON DE SNAPSHOT DIÁRIO: sync-health-monitor (02:00 UTC = 23:00 BRT)
--    Gera relatório diário e envia para o Slack
-- ─────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'sync-health-snapshot-diario',
  '0 2 * * *',
  $$SELECT net.http_post(
    url := 'https://sspvizogbcyigquqycsz.supabase.co/functions/v1/sync-health-monitor',
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcHZpem9nYmN5aWdxdXF5Y3N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjE1NiwiZXhwIjoyMDgzMzcyMTU2fQ.UkxycOBwslNeY5ABRn4_QmuvTpev3IrURYWA23_rUcc","Content-Type":"application/json"}'::jsonb,
    body := '{"action":"snapshot"}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id$$
);

-- ─────────────────────────────────────────────────────────────
-- 4. REBALANCEAR CRONs INDIVIDUAIS (fallback — frequência reduzida)
--    O orquestrador cuida da sincronização principal.
--    Os CRONs individuais ficam como fallback com frequência menor.
-- ─────────────────────────────────────────────────────────────

-- advise_drain_reverse_cron: */5 → */20
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'advise_drain_reverse_cron'),
  schedule := '*/20 * * * *'
);

-- advise-drain-by-date: */15 → */30
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'advise-drain-by-date'),
  schedule := '*/30 * * * *'
);

-- advise-drain-contratos-cron: */2 → */10 (era muito agressivo)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'advise-drain-contratos-cron'),
  schedule := '*/10 * * * *'
);

-- advise-backfill-lido-cron: */10 → */20
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'advise-backfill-lido-cron'),
  schedule := '*/20 * * * *'
);

-- fix_advise_backfill_runner: */10 → */20
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'fix_advise_backfill_runner'),
  schedule := '*/20 * * * *'
);

-- fix_fs_account_repair_activities: */10 → */20
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'fix_fs_account_repair_activities'),
  schedule := '*/20 * * * *'
);

-- fix_publicacoes_freshsales: */15 → */20
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'fix_publicacoes_freshsales'),
  schedule := '*/20 * * * *'
);

-- publicacoes-audiencias-extract: */15 → */30
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'publicacoes-audiencias-extract'),
  schedule := '*/30 * * * *'
);

-- publicacoes-prazos-calcular: */15 → */30
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'publicacoes-prazos-calcular'),
  schedule := '*/30 * * * *'
);

-- publicacoes-prazos-criar-tasks: */15 → */30
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'publicacoes-prazos-criar-tasks'),
  schedule := '*/30 * * * *'
);

-- datajud-worker: */10 → */15
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'datajud-worker'),
  schedule := '*/15 * * * *'
);

-- sync-worker: */10 → */20
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sync-worker'),
  schedule := '*/20 * * * *'
);

-- agentlab-runner-cron: */5 → */10
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'agentlab-runner-cron'),
  schedule := '*/10 * * * *'
);

-- ─────────────────────────────────────────────────────────────
-- 5. VERIFICAR RESULTADO FINAL
-- ─────────────────────────────────────────────────────────────
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
