begin;

create table if not exists judiciario.operacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  acao text not null,
  status text not null default 'success',
  payload jsonb not null default '{}'::jsonb,
  resumo text null,
  result_summary jsonb not null default '{}'::jsonb,
  result_sample jsonb not null default '[]'::jsonb,
  requested_count integer not null default 0,
  affected_count integer not null default 0,
  error_message text null,
  created_at timestamptz not null default now(),
  finished_at timestamptz not null default now()
);

create index if not exists idx_operacao_execucoes_modulo_created_at
  on judiciario.operacao_execucoes (modulo, created_at desc);

create index if not exists idx_operacao_execucoes_acao_created_at
  on judiciario.operacao_execucoes (acao, created_at desc);

grant usage on schema judiciario to authenticated, service_role;
grant select, insert on table judiciario.operacao_execucoes to authenticated, service_role;
grant select on table judiciario.operacao_execucoes to anon;

commit;
