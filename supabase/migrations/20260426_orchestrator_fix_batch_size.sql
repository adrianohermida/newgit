DROP FUNCTION IF EXISTS public.orchestrator_get_next_jobs(integer);

CREATE FUNCTION public.orchestrator_get_next_jobs(p_max_jobs integer DEFAULT 5)
RETURNS TABLE(
  job_id uuid,
  entidade text,
  acao text,
  pendentes bigint,
  prioridade integer,
  batch_size integer,
  fn_name text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH v_rate AS (
    SELECT COALESCE(
      (SELECT (990 - COALESCE(SUM(calls_used), 0))
       FROM public.freshsales_rate_limit
       WHERE window_start = date_trunc('hour', now())),
      990
    ) AS slots
  ),
  pendencias AS (
    SELECT * FROM public.orchestrator_check_pendencias()
    WHERE pendentes > 0
  ),
  jobs_config AS (
    SELECT
      p.entidade AS pend_entidade,
      p.acao AS pend_acao,
      p.pendentes AS pend_pendentes,
      p.prioridade AS pend_prioridade,
      CASE
        WHEN p.entidade = 'processos' AND p.acao = 'create_account' THEN LEAST(10, (SELECT slots FROM v_rate) / 5)
        WHEN p.entidade = 'publicacoes' THEN LEAST(20, (SELECT slots FROM v_rate) / 3)
        WHEN p.entidade = 'movimentos' THEN LEAST(15, (SELECT slots FROM v_rate) / 4)
        WHEN p.entidade = 'partes' THEN LEAST(15, (SELECT slots FROM v_rate) / 5)
        WHEN p.entidade = 'prazos' THEN LEAST(10, (SELECT slots FROM v_rate) / 6)
        ELSE 5
      END::int AS batch_size,
      CASE
        WHEN p.entidade = 'processos' AND p.acao = 'create_account' THEN 'processo-sync'
        WHEN p.entidade = 'publicacoes' THEN 'publicacoes-freshsales'
        WHEN p.entidade = 'movimentos' THEN 'datajud-andamentos-sync'
        WHEN p.entidade = 'partes' THEN 'publicacoes-partes'
        WHEN p.entidade = 'audiencias' THEN 'publicacoes-audiencias'
        WHEN p.entidade = 'prazos' THEN 'publicacoes-prazos'
        WHEN p.entidade = 'datajud' THEN 'datajud-worker'
        WHEN p.entidade = 'advise' AND p.acao = 'drain_publicacoes' THEN 'advise-drain-by-date'
        WHEN p.entidade = 'advise' AND p.acao = 'backfill' THEN 'advise-backfill-runner'
        ELSE NULL
      END AS fn_name
    FROM pendencias p
  ),
  jobs_com_id AS (
    SELECT
      jc.pend_entidade,
      jc.pend_acao,
      jc.pend_pendentes,
      jc.pend_prioridade,
      jc.batch_size,
      jc.fn_name,
      COALESCE(o.id, gen_random_uuid()) AS job_id
    FROM jobs_config jc
    LEFT JOIN public.sync_orchestrator o
      ON o.entidade = jc.pend_entidade AND o.acao = jc.pend_acao
    WHERE jc.fn_name IS NOT NULL
      AND jc.batch_size > 0
      AND (o.status IS NULL OR o.status IN ('idle', 'done', 'error'))
      AND (o.proximo_run IS NULL OR o.proximo_run <= now())
  )
  SELECT
    jc.job_id,
    jc.pend_entidade AS entidade,
    jc.pend_acao AS acao,
    jc.pend_pendentes AS pendentes,
    jc.pend_prioridade AS prioridade,
    jc.batch_size,
    jc.fn_name
  FROM jobs_com_id jc
  ORDER BY jc.pend_prioridade
  LIMIT p_max_jobs;
$$;
