-- ============================================================
-- Migração: Sistema de Orquestração Central de Sincronização
-- Data: 2026-04-25
-- Objetivo: Tabela de controle + função maestro que coordena
--           todos os fluxos de sync sem retrabalho
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TABELA PRINCIPAL: sync_orchestrator
--    Registra o estado de cada "job" de sincronização por entidade
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_orchestrator (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade            text NOT NULL,           -- processos|publicacoes|partes|movimentos|audiencias|prazos|advise|datajud
  acao                text NOT NULL,           -- create_account|sync_activity|extract_parts|calc_deadline|etc
  status              text NOT NULL DEFAULT 'idle',  -- idle|running|done|error|skipped
  pendentes           integer DEFAULT 0,       -- contagem de itens pendentes ao iniciar
  processados         integer DEFAULT 0,       -- itens processados nesta execução
  erros               integer DEFAULT 0,       -- itens com erro nesta execução
  iniciado_em         timestamptz,
  concluido_em        timestamptz,
  proximo_run         timestamptz,             -- quando pode rodar novamente (throttle)
  ultima_janela_dia   date,                    -- data do último ciclo diário completo
  ciclo_diario_ok     boolean DEFAULT false,   -- true = ciclo do dia concluído com 0 pendentes
  meta                jsonb DEFAULT '{}',      -- dados extras (batch_size, cursor, etc)
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(entidade, acao)
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_sync_orch_status ON public.sync_orchestrator(status);
CREATE INDEX IF NOT EXISTS idx_sync_orch_proximo ON public.sync_orchestrator(proximo_run);
CREATE INDEX IF NOT EXISTS idx_sync_orch_entidade ON public.sync_orchestrator(entidade);

-- ─────────────────────────────────────────────────────────────
-- 2. TABELA DE LOG: sync_orchestrator_log
--    Histórico de cada execução para auditoria e diagnóstico
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_orchestrator_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid REFERENCES public.sync_orchestrator(id),
  entidade        text NOT NULL,
  acao            text NOT NULL,
  status          text NOT NULL,
  pendentes_antes integer DEFAULT 0,
  processados     integer DEFAULT 0,
  erros           integer DEFAULT 0,
  duracao_ms      integer,
  detalhe         jsonb DEFAULT '{}',
  criado_em       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_entidade ON public.sync_orchestrator_log(entidade, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_criado ON public.sync_orchestrator_log(criado_em DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. TABELA DE SAÚDE: sync_health_snapshot
--    Snapshot diário do estado de saneamento por entidade
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_health_snapshot (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   date NOT NULL DEFAULT CURRENT_DATE,
  entidade        text NOT NULL,
  total           integer DEFAULT 0,
  sincronizados   integer DEFAULT 0,
  pendentes       integer DEFAULT 0,
  pct_cobertura   numeric(5,2) DEFAULT 0,
  status_saude    text DEFAULT 'unknown',  -- healthy|warning|critical
  detalhe         jsonb DEFAULT '{}',
  criado_em       timestamptz DEFAULT now(),
  UNIQUE(snapshot_date, entidade)
);

CREATE INDEX IF NOT EXISTS idx_health_snap_date ON public.sync_health_snapshot(snapshot_date DESC);

-- ─────────────────────────────────────────────────────────────
-- 4. FUNÇÃO: orchestrator_check_pendencias()
--    Retorna contagem real de pendentes por entidade/ação
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orchestrator_check_pendencias()
RETURNS TABLE(entidade text, acao text, pendentes bigint, prioridade int)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY

  -- Processos sem account no Freshsales (pré-requisito para tudo)
  SELECT 'processos'::text, 'create_account'::text,
    COUNT(*)::bigint,
    1  -- maior prioridade
  FROM judiciario.processos
  WHERE account_id_freshsales IS NULL OR account_id_freshsales = ''

  UNION ALL

  -- Publicações pendentes de sync
  SELECT 'publicacoes'::text, 'sync_activity'::text,
    COUNT(*)::bigint, 2
  FROM judiciario.publicacoes
  WHERE freshsales_activity_id IS NULL
    AND processo_id IS NOT NULL

  UNION ALL

  -- Movimentos pendentes de sync
  SELECT 'movimentos'::text, 'sync_activity'::text,
    COUNT(*)::bigint, 3
  FROM judiciario.movimentos
  WHERE freshsales_activity_id IS NULL

  UNION ALL

  -- Partes sem contact no Freshsales
  SELECT 'partes'::text, 'create_contact'::text,
    COUNT(*)::bigint, 2
  FROM judiciario.partes
  WHERE contact_id_freshsales IS NULL

  UNION ALL

  -- Audiências pendentes de sync
  SELECT 'audiencias'::text, 'sync_activity'::text,
    COUNT(*)::bigint, 2
  FROM judiciario.audiencias
  WHERE freshsales_activity_id IS NULL

  UNION ALL

  -- Prazos sem task no Freshsales
  SELECT 'prazos'::text, 'create_task'::text,
    COUNT(*)::bigint, 3
  FROM judiciario.prazo_calculado
  WHERE freshsales_task_id IS NULL

  UNION ALL

  -- Monitoramento queue pendente (DataJud)
  SELECT 'datajud'::text, 'fetch_movimentos'::text,
    COUNT(*)::bigint, 2
  FROM judiciario.monitoramento_queue
  WHERE status = 'pendente'

  ORDER BY prioridade, pendentes DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. FUNÇÃO: orchestrator_get_next_jobs(p_max_jobs int)
--    Retorna os jobs que devem ser executados agora
--    (respeitando throttle, rate limit e dependências)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orchestrator_get_next_jobs(p_max_jobs int DEFAULT 5)
RETURNS TABLE(
  job_id      uuid,
  entidade    text,
  acao        text,
  pendentes   bigint,
  prioridade  int,
  batch_size  int,
  fn_name     text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_slots_disponiveis int;
  v_proc_sem_account bigint;
BEGIN
  -- Verificar slots de rate limit disponíveis
  SELECT COALESCE(990 - SUM(calls_used + quota_reserved), 990)
  INTO v_slots_disponiveis
  FROM freshsales_rate_limit
  WHERE window_start >= date_trunc('hour', now());

  -- Se não há slots, não retornar nenhum job
  IF v_slots_disponiveis < 10 THEN
    RETURN;
  END IF;

  -- Verificar se processos sem account ainda bloqueiam publicações
  SELECT COUNT(*) INTO v_proc_sem_account
  FROM judiciario.processos
  WHERE account_id_freshsales IS NULL OR account_id_freshsales = '';

  RETURN QUERY
  WITH pendencias AS (
    SELECT * FROM public.orchestrator_check_pendencias()
    WHERE pendentes > 0
  ),
  jobs_candidatos AS (
    SELECT
      COALESCE(o.id, gen_random_uuid()) as job_id,
      p.entidade,
      p.acao,
      p.pendentes,
      p.prioridade,
      -- Batch size dinâmico baseado nos slots disponíveis e prioridade
      CASE
        WHEN p.entidade = 'processos' AND p.acao = 'create_account' THEN LEAST(50, v_slots_disponiveis / 5)
        WHEN p.entidade = 'publicacoes' THEN LEAST(30, v_slots_disponiveis / 3)
        WHEN p.entidade = 'movimentos' THEN LEAST(25, v_slots_disponiveis / 4)
        WHEN p.entidade = 'partes' THEN LEAST(20, v_slots_disponiveis / 5)
        WHEN p.entidade = 'prazos' THEN LEAST(15, v_slots_disponiveis / 6)
        ELSE 10
      END::int as batch_size,
      -- Nome da Edge Function responsável
      CASE
        WHEN p.entidade = 'processos' AND p.acao = 'create_account' THEN 'processo-sync'
        WHEN p.entidade = 'publicacoes' THEN 'publicacoes-freshsales'
        WHEN p.entidade = 'movimentos' THEN 'datajud-andamentos-sync'
        WHEN p.entidade = 'partes' THEN 'publicacoes-partes'
        WHEN p.entidade = 'audiencias' THEN 'publicacoes-audiencias'
        WHEN p.entidade = 'prazos' THEN 'publicacoes-prazos'
        WHEN p.entidade = 'datajud' THEN 'datajud-worker'
        ELSE NULL
      END as fn_name,
      -- Verificar se o job pode rodar agora (throttle)
      CASE
        WHEN o.proximo_run IS NULL OR o.proximo_run <= now() THEN true
        ELSE false
      END as pode_rodar,
      -- Bloquear publicações se ainda há processos sem account (dependência)
      CASE
        WHEN p.entidade = 'publicacoes' AND v_proc_sem_account > 500 THEN false
        ELSE true
      END as dependencia_ok
    FROM pendencias p
    LEFT JOIN public.sync_orchestrator o ON o.entidade = p.entidade AND o.acao = p.acao
    WHERE (o.status IS NULL OR o.status NOT IN ('running'))
  )
  SELECT
    job_id, entidade, acao, pendentes, prioridade, batch_size, fn_name
  FROM jobs_candidatos
  WHERE pode_rodar = true
    AND dependencia_ok = true
    AND fn_name IS NOT NULL
  ORDER BY prioridade ASC, pendentes DESC
  LIMIT p_max_jobs;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. FUNÇÃO: orchestrator_mark_running(p_entidade, p_acao, p_pendentes)
--    Marca um job como em execução (lock otimista)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orchestrator_mark_running(
  p_entidade text,
  p_acao text,
  p_pendentes int DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.sync_orchestrator(entidade, acao, status, pendentes, iniciado_em, updated_at)
  VALUES (p_entidade, p_acao, 'running', p_pendentes, now(), now())
  ON CONFLICT(entidade, acao) DO UPDATE SET
    status = 'running',
    pendentes = p_pendentes,
    iniciado_em = now(),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. FUNÇÃO: orchestrator_mark_done(p_job_id, p_processados, p_erros, p_detalhe)
--    Registra conclusão e agenda próxima execução com throttle inteligente
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orchestrator_mark_done(
  p_job_id      uuid,
  p_processados int DEFAULT 0,
  p_erros       int DEFAULT 0,
  p_detalhe     jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entidade text;
  v_acao text;
  v_pendentes_antes int;
  v_pendentes_agora bigint;
  v_iniciado_em timestamptz;
  v_duracao_ms int;
  v_proximo_run timestamptz;
  v_ciclo_ok boolean := false;
BEGIN
  SELECT entidade, acao, pendentes, iniciado_em
  INTO v_entidade, v_acao, v_pendentes_antes, v_iniciado_em
  FROM public.sync_orchestrator WHERE id = p_job_id;

  v_duracao_ms := EXTRACT(EPOCH FROM (now() - v_iniciado_em)) * 1000;

  -- Verificar pendências restantes após execução
  SELECT pendentes INTO v_pendentes_agora
  FROM public.orchestrator_check_pendencias()
  WHERE entidade = v_entidade AND acao = v_acao
  LIMIT 1;

  v_pendentes_agora := COALESCE(v_pendentes_agora, 0);

  -- Throttle inteligente: se ainda há pendências, rodar mais rápido; se zerou, aguardar mais
  v_proximo_run := CASE
    WHEN v_pendentes_agora = 0 THEN now() + interval '1 hour'   -- ciclo completo: aguardar 1h
    WHEN v_pendentes_agora < 100 THEN now() + interval '5 minutes'
    WHEN v_pendentes_agora < 1000 THEN now() + interval '3 minutes'
    ELSE now() + interval '1 minute'                             -- muitas pendências: rodar logo
  END;

  -- Ciclo diário completo?
  v_ciclo_ok := (v_pendentes_agora = 0);

  -- Atualizar job
  UPDATE public.sync_orchestrator SET
    status = CASE WHEN p_erros > 0 AND p_processados = 0 THEN 'error' ELSE 'done' END,
    processados = p_processados,
    erros = p_erros,
    concluido_em = now(),
    proximo_run = v_proximo_run,
    ultima_janela_dia = CASE WHEN v_ciclo_ok THEN CURRENT_DATE ELSE ultima_janela_dia END,
    ciclo_diario_ok = v_ciclo_ok,
    meta = p_detalhe,
    updated_at = now()
  WHERE id = p_job_id;

  -- Registrar no log
  INSERT INTO public.sync_orchestrator_log(
    job_id, entidade, acao, status, pendentes_antes, processados, erros, duracao_ms, detalhe
  ) VALUES (
    p_job_id, v_entidade, v_acao,
    CASE WHEN p_erros > 0 AND p_processados = 0 THEN 'error' ELSE 'done' END,
    v_pendentes_antes, p_processados, p_erros, v_duracao_ms, p_detalhe
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. FUNÇÃO: orchestrator_health_snapshot()
--    Gera snapshot diário de saúde por entidade
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orchestrator_health_snapshot()
RETURNS TABLE(entidade text, total bigint, sincronizados bigint, pendentes bigint, pct_cobertura numeric, status_saude text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY

  -- Processos
  SELECT 'processos'::text,
    COUNT(*)::bigint as total,
    SUM(CASE WHEN account_id_freshsales IS NOT NULL AND account_id_freshsales != '' THEN 1 ELSE 0 END)::bigint as sincronizados,
    SUM(CASE WHEN account_id_freshsales IS NULL OR account_id_freshsales = '' THEN 1 ELSE 0 END)::bigint as pendentes,
    ROUND(SUM(CASE WHEN account_id_freshsales IS NOT NULL AND account_id_freshsales != '' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2),
    CASE
      WHEN SUM(CASE WHEN account_id_freshsales IS NULL OR account_id_freshsales = '' THEN 1 ELSE 0 END) = 0 THEN 'healthy'
      WHEN SUM(CASE WHEN account_id_freshsales IS NULL OR account_id_freshsales = '' THEN 1 ELSE 0 END) < 100 THEN 'warning'
      ELSE 'critical'
    END
  FROM judiciario.processos

  UNION ALL

  -- Publicações
  SELECT 'publicacoes'::text,
    COUNT(*)::bigint,
    SUM(CASE WHEN freshsales_activity_id IS NOT NULL THEN 1 ELSE 0 END)::bigint,
    SUM(CASE WHEN freshsales_activity_id IS NULL AND processo_id IS NOT NULL THEN 1 ELSE 0 END)::bigint,
    ROUND(SUM(CASE WHEN freshsales_activity_id IS NOT NULL THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2),
    CASE
      WHEN SUM(CASE WHEN freshsales_activity_id IS NULL AND processo_id IS NOT NULL THEN 1 ELSE 0 END) = 0 THEN 'healthy'
      WHEN SUM(CASE WHEN freshsales_activity_id IS NULL AND processo_id IS NOT NULL THEN 1 ELSE 0 END) < 50 THEN 'warning'
      ELSE 'critical'
    END
  FROM judiciario.publicacoes

  UNION ALL

  -- Movimentos
  SELECT 'movimentos'::text,
    COUNT(*)::bigint,
    SUM(CASE WHEN freshsales_activity_id IS NOT NULL THEN 1 ELSE 0 END)::bigint,
    SUM(CASE WHEN freshsales_activity_id IS NULL THEN 1 ELSE 0 END)::bigint,
    ROUND(SUM(CASE WHEN freshsales_activity_id IS NOT NULL THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2),
    CASE
      WHEN SUM(CASE WHEN freshsales_activity_id IS NULL THEN 1 ELSE 0 END) = 0 THEN 'healthy'
      WHEN SUM(CASE WHEN freshsales_activity_id IS NULL THEN 1 ELSE 0 END) < 100 THEN 'warning'
      ELSE 'critical'
    END
  FROM judiciario.movimentos

  UNION ALL

  -- Partes
  SELECT 'partes'::text,
    COUNT(*)::bigint,
    SUM(CASE WHEN contact_id_freshsales IS NOT NULL THEN 1 ELSE 0 END)::bigint,
    SUM(CASE WHEN contact_id_freshsales IS NULL THEN 1 ELSE 0 END)::bigint,
    ROUND(SUM(CASE WHEN contact_id_freshsales IS NOT NULL THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2),
    CASE
      WHEN SUM(CASE WHEN contact_id_freshsales IS NULL THEN 1 ELSE 0 END) = 0 THEN 'healthy'
      WHEN SUM(CASE WHEN contact_id_freshsales IS NULL THEN 1 ELSE 0 END) < 50 THEN 'warning'
      ELSE 'critical'
    END
  FROM judiciario.partes

  UNION ALL

  -- Audiências
  SELECT 'audiencias'::text,
    COUNT(*)::bigint,
    SUM(CASE WHEN freshsales_activity_id IS NOT NULL THEN 1 ELSE 0 END)::bigint,
    SUM(CASE WHEN freshsales_activity_id IS NULL THEN 1 ELSE 0 END)::bigint,
    ROUND(SUM(CASE WHEN freshsales_activity_id IS NOT NULL THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2),
    CASE
      WHEN SUM(CASE WHEN freshsales_activity_id IS NULL THEN 1 ELSE 0 END) = 0 THEN 'healthy'
      ELSE 'warning'
    END
  FROM judiciario.audiencias

  UNION ALL

  -- Prazos
  SELECT 'prazos'::text,
    COUNT(*)::bigint,
    SUM(CASE WHEN freshsales_task_id IS NOT NULL THEN 1 ELSE 0 END)::bigint,
    SUM(CASE WHEN freshsales_task_id IS NULL THEN 1 ELSE 0 END)::bigint,
    ROUND(SUM(CASE WHEN freshsales_task_id IS NOT NULL THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2),
    CASE
      WHEN SUM(CASE WHEN freshsales_task_id IS NULL THEN 1 ELSE 0 END) = 0 THEN 'healthy'
      WHEN SUM(CASE WHEN freshsales_task_id IS NULL THEN 1 ELSE 0 END) < 50 THEN 'warning'
      ELSE 'critical'
    END
  FROM judiciario.prazo_calculado;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. VIEW: vw_orchestrator_status
--    Dashboard em tempo real do estado do orquestrador
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_orchestrator_status AS
SELECT
  o.entidade,
  o.acao,
  o.status,
  o.pendentes,
  o.processados,
  o.erros,
  o.ciclo_diario_ok,
  o.ultima_janela_dia,
  o.proximo_run,
  EXTRACT(EPOCH FROM (now() - o.concluido_em))::int / 60 as minutos_desde_ultimo_run,
  CASE
    WHEN o.proximo_run <= now() THEN 'pronto'
    ELSE 'aguardando'
  END as disponibilidade,
  o.updated_at
FROM public.sync_orchestrator o
ORDER BY o.entidade, o.acao;

-- ─────────────────────────────────────────────────────────────
-- 10. Inserir jobs iniciais no orquestrador
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.sync_orchestrator(entidade, acao, status, proximo_run)
VALUES
  ('processos',   'create_account',  'idle', now()),
  ('publicacoes', 'sync_activity',   'idle', now()),
  ('movimentos',  'sync_activity',   'idle', now()),
  ('partes',      'create_contact',  'idle', now()),
  ('audiencias',  'sync_activity',   'idle', now()),
  ('prazos',      'create_task',     'idle', now()),
  ('datajud',     'fetch_movimentos','idle', now()),
  ('advise',      'drain_publicacoes','idle', now()),
  ('advise',      'backfill',        'idle', now())
ON CONFLICT(entidade, acao) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 11. Atualizar a view vw_sync_pendencias para incluir movimentos e prazos
-- ─────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS judiciario.vw_sync_pendencias;
CREATE VIEW judiciario.vw_sync_pendencias AS
SELECT
  (SELECT COUNT(*) FROM judiciario.processos WHERE account_id_freshsales IS NULL OR account_id_freshsales = '')::bigint AS proc_sem_account,
  (SELECT COUNT(*) FROM judiciario.publicacoes WHERE freshsales_activity_id IS NULL AND processo_id IS NOT NULL)::bigint AS pub_pendentes_fs,
  (SELECT COUNT(*) FROM judiciario.movimentos WHERE freshsales_activity_id IS NULL)::bigint AS mov_pendentes,
  (SELECT COUNT(*) FROM judiciario.partes WHERE contact_id_freshsales IS NULL)::bigint AS partes_sem_contact,
  (SELECT COUNT(*) FROM judiciario.audiencias WHERE freshsales_activity_id IS NULL)::bigint AS audiencias_pendentes,
  (SELECT COUNT(*) FROM judiciario.prazo_calculado WHERE freshsales_task_id IS NULL)::bigint AS prazos_sem_task,
  (SELECT COUNT(*) FROM judiciario.monitoramento_queue WHERE status = 'pendente')::bigint AS datajud_pendentes,
  (
    (SELECT COUNT(*) FROM judiciario.processos WHERE account_id_freshsales IS NULL OR account_id_freshsales = '') +
    (SELECT COUNT(*) FROM judiciario.publicacoes WHERE freshsales_activity_id IS NULL AND processo_id IS NOT NULL) +
    (SELECT COUNT(*) FROM judiciario.movimentos WHERE freshsales_activity_id IS NULL) +
    (SELECT COUNT(*) FROM judiciario.partes WHERE contact_id_freshsales IS NULL) +
    (SELECT COUNT(*) FROM judiciario.audiencias WHERE freshsales_activity_id IS NULL) +
    (SELECT COUNT(*) FROM judiciario.prazo_calculado WHERE freshsales_task_id IS NULL) +
    (SELECT COUNT(*) FROM judiciario.monitoramento_queue WHERE status = 'pendente')
  )::bigint AS total_pendencias;
