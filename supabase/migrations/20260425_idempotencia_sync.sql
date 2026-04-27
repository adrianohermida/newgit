-- ============================================================
-- Migração: Idempotência e Skip Inteligente
-- Data: 2026-04-25
-- Objetivo: Garantir que nenhum registro já sincronizado seja
--           reprocessado, eliminando retrabalho e chamadas desnecessárias
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Função: skip_if_synced_publicacao
--    Retorna TRUE se a publicação já está sincronizada (tem activity_id)
--    e o registro não foi atualizado desde a última sync
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION judiciario.skip_if_synced_publicacao(
  p_id UUID,
  p_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_activity_id TEXT;
  v_synced_at   TIMESTAMPTZ;
BEGIN
  SELECT freshsales_activity_id, freshsales_synced_at
    INTO v_activity_id, v_synced_at
    FROM judiciario.publicacoes
   WHERE id = p_id;

  -- Já sincronizado e não foi atualizado depois
  IF v_activity_id IS NOT NULL AND v_activity_id != '' THEN
    IF p_updated_at IS NULL OR v_synced_at >= p_updated_at THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Função: skip_if_synced_processo
--    Retorna TRUE se o processo já tem account_id e não mudou
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION judiciario.skip_if_synced_processo(
  p_id UUID,
  p_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_account_id TEXT;
  v_synced_at  TIMESTAMPTZ;
BEGIN
  SELECT account_id_freshsales, freshsales_synced_at
    INTO v_account_id, v_synced_at
    FROM judiciario.processos
   WHERE id = p_id;

  IF v_account_id IS NOT NULL AND v_account_id != '' THEN
    IF p_updated_at IS NULL OR v_synced_at IS NULL OR v_synced_at >= p_updated_at THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Função: mark_synced_publicacao
--    Marca uma publicação como sincronizada de forma atômica
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION judiciario.mark_synced_publicacao(
  p_id                  UUID,
  p_activity_id         TEXT,
  p_deal_id             TEXT DEFAULT NULL,
  p_extra               JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE judiciario.publicacoes
     SET freshsales_activity_id = p_activity_id,
         freshsales_synced_at   = NOW(),
         freshsales_deal_id     = COALESCE(p_deal_id, freshsales_deal_id),
         fs_sync_status         = 'synced',
         fs_sync_error          = NULL
   WHERE id = p_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Função: mark_sync_error_publicacao
--    Registra erro de sync sem bloquear a fila para sempre
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION judiciario.mark_sync_error_publicacao(
  p_id       UUID,
  p_error    TEXT,
  p_retries  INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE judiciario.publicacoes
     SET fs_sync_status  = CASE WHEN p_retries >= 5 THEN 'failed' ELSE 'error' END,
         fs_sync_error   = p_error,
         fs_sync_retries = COALESCE(fs_sync_retries, 0) + 1,
         -- Backoff exponencial: agendar próxima tentativa mais tarde
         fs_sync_next_retry = NOW() + (INTERVAL '5 minutes' * POWER(2, LEAST(p_retries, 5)))
   WHERE id = p_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Adicionar colunas de controle de idempotência se não existirem
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- publicacoes: colunas de controle de sync
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'judiciario' AND table_name = 'publicacoes'
    AND column_name = 'freshsales_synced_at') THEN
    ALTER TABLE judiciario.publicacoes ADD COLUMN freshsales_synced_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'judiciario' AND table_name = 'publicacoes'
    AND column_name = 'fs_sync_status') THEN
    ALTER TABLE judiciario.publicacoes ADD COLUMN fs_sync_status TEXT DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'judiciario' AND table_name = 'publicacoes'
    AND column_name = 'fs_sync_error') THEN
    ALTER TABLE judiciario.publicacoes ADD COLUMN fs_sync_error TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'judiciario' AND table_name = 'publicacoes'
    AND column_name = 'fs_sync_retries') THEN
    ALTER TABLE judiciario.publicacoes ADD COLUMN fs_sync_retries INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'judiciario' AND table_name = 'publicacoes'
    AND column_name = 'fs_sync_next_retry') THEN
    ALTER TABLE judiciario.publicacoes ADD COLUMN fs_sync_next_retry TIMESTAMPTZ;
  END IF;

  -- processos: coluna de controle de sync
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'judiciario' AND table_name = 'processos'
    AND column_name = 'freshsales_synced_at') THEN
    ALTER TABLE judiciario.processos ADD COLUMN freshsales_synced_at TIMESTAMPTZ;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Índices para acelerar queries de pendências (evitar full scan)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pub_fs_sync_status
  ON judiciario.publicacoes (fs_sync_status, fs_sync_next_retry)
  WHERE fs_sync_status IN ('pending', 'error');

CREATE INDEX IF NOT EXISTS idx_pub_activity_null
  ON judiciario.publicacoes (data_publicacao DESC)
  WHERE freshsales_activity_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_proc_account_null
  ON judiciario.processos (id)
  WHERE account_id_freshsales IS NULL OR account_id_freshsales = '';

-- ─────────────────────────────────────────────────────────────
-- 7. Atualizar fs_sync_status para publicações já sincronizadas
--    (backfill das novas colunas de controle)
-- ─────────────────────────────────────────────────────────────
UPDATE judiciario.publicacoes
   SET fs_sync_status = 'synced',
       freshsales_synced_at = data_publicacao
 WHERE freshsales_activity_id IS NOT NULL
   AND freshsales_activity_id != ''
   AND (fs_sync_status IS NULL OR fs_sync_status = 'pending');

-- ─────────────────────────────────────────────────────────────
-- 8. View atualizada: vw_sync_pendencias com status de idempotência
-- ─────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS judiciario.vw_sync_pendencias;
CREATE VIEW judiciario.vw_sync_pendencias AS
SELECT
  -- Processos
  (SELECT COUNT(*) FROM judiciario.processos
   WHERE account_id_freshsales IS NULL OR account_id_freshsales = '')::bigint AS proc_sem_account,

  -- Publicações (excluindo failed e com retry futuro)
  (SELECT COUNT(*) FROM judiciario.publicacoes
   WHERE freshsales_activity_id IS NULL
     AND processo_id IS NOT NULL
     AND (fs_sync_status IS NULL OR fs_sync_status IN ('pending', 'error'))
     AND (fs_sync_next_retry IS NULL OR fs_sync_next_retry <= NOW()))::bigint AS pub_pendentes_fs,

  -- Publicações com erro permanente (failed)
  (SELECT COUNT(*) FROM judiciario.publicacoes
   WHERE fs_sync_status = 'failed')::bigint AS pub_failed,

  -- Movimentos
  (SELECT COUNT(*) FROM judiciario.movimentos
   WHERE freshsales_activity_id IS NULL)::bigint AS mov_pendentes,

  -- Partes
  (SELECT COUNT(*) FROM judiciario.partes
   WHERE contact_id_freshsales IS NULL)::bigint AS partes_sem_contact,

  -- Audiências
  (SELECT COUNT(*) FROM judiciario.audiencias
   WHERE freshsales_activity_id IS NULL)::bigint AS audiencias_pendentes,

  -- Prazos
  (SELECT COUNT(*) FROM judiciario.prazo_calculado
   WHERE freshsales_task_id IS NULL)::bigint AS prazos_sem_task,

  -- Timestamp
  NOW() AS verificado_em;

-- ─────────────────────────────────────────────────────────────
-- 9. Função: orchestrator_check_pendencias (atualizada)
--    Retorna contagens reais por entidade para o orquestrador
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orchestrator_check_pendencias()
RETURNS TABLE (
  entidade    TEXT,
  acao        TEXT,
  pendentes   BIGINT,
  prioridade  INT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 'processos'::TEXT, 'create_account'::TEXT,
    (SELECT COUNT(*) FROM judiciario.processos
     WHERE account_id_freshsales IS NULL OR account_id_freshsales = '')::BIGINT,
    1::INT

  UNION ALL SELECT 'publicacoes', 'sync_activity',
    (SELECT COUNT(*) FROM judiciario.publicacoes
     WHERE freshsales_activity_id IS NULL
       AND processo_id IS NOT NULL
       AND (fs_sync_status IS NULL OR fs_sync_status IN ('pending', 'error'))
       AND (fs_sync_next_retry IS NULL OR fs_sync_next_retry <= NOW()))::BIGINT,
    2

  UNION ALL SELECT 'movimentos', 'sync_activity',
    (SELECT COUNT(*) FROM judiciario.movimentos
     WHERE freshsales_activity_id IS NULL)::BIGINT,
    3

  UNION ALL SELECT 'partes', 'create_contact',
    (SELECT COUNT(*) FROM judiciario.partes
     WHERE contact_id_freshsales IS NULL)::BIGINT,
    4

  UNION ALL SELECT 'audiencias', 'sync_activity',
    (SELECT COUNT(*) FROM judiciario.audiencias
     WHERE freshsales_activity_id IS NULL)::BIGINT,
    5

  UNION ALL SELECT 'prazos', 'create_task',
    (SELECT COUNT(*) FROM judiciario.prazo_calculado
     WHERE freshsales_task_id IS NULL)::BIGINT,
    6

  UNION ALL SELECT 'datajud', 'fetch_movimentos',
    (SELECT COUNT(*) FROM judiciario.processos
     WHERE (datajud_last_success_at IS NULL OR datajud_last_success_at < NOW() - INTERVAL '24 hours')
       AND account_id_freshsales IS NOT NULL
       AND (datajud_nao_enriquecivel IS NULL OR datajud_nao_enriquecivel = FALSE))::BIGINT,
    7

  UNION ALL SELECT 'advise', 'drain_publicacoes',
    (SELECT COUNT(*) FROM judiciario.publicacoes
     WHERE advise_id_publicacao_cliente IS NOT NULL
       AND freshsales_activity_id IS NULL
       AND (fs_sync_status IS NULL OR fs_sync_status = 'pending'))::BIGINT,
    8

  UNION ALL SELECT 'advise', 'backfill',
    (SELECT COUNT(*) FROM judiciario.advise_backfill_queue
     WHERE status = 'pending')::BIGINT,
    9;
END;
$$;

