-- HMADV - correcao minima para o sync-worker
-- Objetivo:
-- 1. garantir acesso da service_role a judiciario.sync_worker_status
-- 2. garantir a existencia da linha singleton id=1 usada pelo worker
--
-- Aplicar no projeto HMADV (sspvizogbcyigquqycsz).

begin;

-- A service_role precisa conseguir ler/gravar a tabela de estado do worker.
grant usage on schema judiciario to service_role;
grant select, insert, update on table judiciario.sync_worker_status to service_role;

-- Em alguns ambientes a tabela pode ter RLS habilitado por acidente.
-- Como essa eh uma tabela tecnica de controle interno, mantemos sem RLS.
alter table judiciario.sync_worker_status disable row level security;

-- Seed do registro singleton esperado pelo sync-worker.
insert into judiciario.sync_worker_status (
  id,
  em_execucao,
  iniciado_em,
  ultima_execucao,
  ultimo_lote,
  pendencias,
  historico,
  rodadas_atual,
  erro_ultimo,
  versao
)
values (
  1,
  false,
  null,
  null,
  '{}'::jsonb,
  '{}'::jsonb,
  '[]'::jsonb,
  0,
  null,
  1
)
on conflict (id) do nothing;

commit;

-- Verificacao rapida
-- select * from judiciario.sync_worker_status where id = 1;
