-- ============================================================
-- Migração: Ajuste de CRONs para respeitar limite de 990 chamadas/hora ao Freshsales
-- Data: 2026-04-25
-- Problema: Sistema gerava ~2.505 chamadas/hora (253% do limite)
-- Solução: Reduzir frequência e batch sizes dos CRONs mais pesados
-- ============================================================
-- Distribuição alvo após ajuste:
--   fix_fs_account_repair_batch    : 4x/h x 50 = 200/h  (era 12x x 50 = 600/h)
--   datajud-worker                 : 6x/h x 25 = 150/h  (era 12x x 25 = 300/h)
--   billing-import-cron            : 12x/h x 10 = 120/h (era 30x x 10 = 300/h)
--   fix_fs_account_repair_activities: 6x/h x 20 = 120/h (era 12x x 20 = 240/h)
--   fix_fs_repair_orphans          : 2x/h x 60 = 120/h  (era 4x x 60 = 240/h)
--   processo-sync-bidirectional    : 2x/h x 50 = 100/h  (era 2x x 100 = 200/h)
--   advise-backfill-lido-cron      : 6x/h x 5  = 30/h   (era 30x x 5 = 150/h)
--   datajud-andamentos-sync-cron   : 1x/h x 60 = 60/h   (era 2x x 60 = 120/h)
--   sync-worker                    : 6x/h x 10 = 60/h   (era 12x x 10 = 120/h)
--   fix_publicacoes_freshsales     : 4x/h x 15 = 60/h   (era 6x x 15 = 90/h)
--   publicacoes-prazos-criar-tasks : 4x/h x 5  = 20/h   (era 12x x 5 = 60/h)
--   publicacoes-audiencias-extract : 4x/h x 5  = 20/h   (era 6x x 5 = 30/h)
--   billing-deals-sync-cron        : 1x/h x 20 = 20/h   (sem mudança)
--   outros (tags, oauth, contacts) : ~15/h      (sem mudança)
-- ─────────────────────────────────────────────────────────────
-- TOTAL ALVO: ~1.075/h → com rate limiter guardião → efetivo ≤990/h
-- ============================================================

-- 1. fix_fs_account_repair_batch: de */5 para */15 (4x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'fix_fs_account_repair_batch'),
  schedule := '*/15 * * * *'
);

-- 2. datajud-worker: de */5 para */10 (6x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'datajud-worker'),
  schedule := '*/10 * * * *'
);

-- 3. billing-import-cron: de */2 para */5 (12x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'billing-import-cron'),
  schedule := '*/5 * * * *'
);

-- 4. fix_fs_account_repair_activities: de */5 para */10 (6x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'fix_fs_account_repair_activities'),
  schedule := '*/10 * * * *'
);

-- 5. fix_fs_repair_orphans: de */15 para */30 (2x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'fix_fs_repair_orphans'),
  schedule := '*/30 * * * *'
);

-- 6. advise-backfill-lido-cron: de */2 para */10 (6x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'advise-backfill-lido-cron'),
  schedule := '*/10 * * * *'
);

-- 7. datajud-andamentos-sync-cron: de */30 para 0 * * * * (1x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'datajud-andamentos-sync-cron'),
  schedule := '0 * * * *'
);

-- 8. sync-worker: de */5 para */10 (6x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sync-worker'),
  schedule := '*/10 * * * *'
);

-- 9. fix_publicacoes_freshsales: de */10 para */15 (4x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'fix_publicacoes_freshsales'),
  schedule := '*/15 * * * *'
);

-- 10. publicacoes-prazos-criar-tasks: de */5 para */15 (4x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'publicacoes-prazos-criar-tasks'),
  schedule := '*/15 * * * *'
);

-- 11. publicacoes-audiencias-extract: de */10 para */15 (4x/hora)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'publicacoes-audiencias-extract'),
  schedule := '*/15 * * * *'
);

-- 12. fix_advise_backfill_runner: de */5 para */10 (6x/hora) — sem chamadas FS mas alivia CPU
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'fix_advise_backfill_runner'),
  schedule := '*/10 * * * *'
);

-- Verificar resultado
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
