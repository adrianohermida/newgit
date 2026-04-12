create table if not exists judiciario.sync_worker_status (
  id bigint primary key,
  em_execucao boolean not null default false,
  iniciado_em timestamptz null,
  ultima_execucao timestamptz null,
  ultimo_lote jsonb not null default '{}'::jsonb,
  pendencias jsonb not null default '{}'::jsonb,
  historico jsonb not null default '[]'::jsonb,
  rodadas_atual integer not null default 0,
  erro_ultimo text null,
  versao integer not null default 1
);

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
