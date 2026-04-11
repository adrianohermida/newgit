begin;

create schema if not exists judiciario;

create extension if not exists pgcrypto;

create table if not exists judiciario.operacao_jobs (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  acao text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  requested_count integer not null default 0,
  processed_count integer not null default 0,
  success_count integer not null default 0,
  error_count integer not null default 0,
  result_summary jsonb not null default '{}'::jsonb,
  result_sample jsonb not null default '[]'::jsonb,
  last_error text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  updated_at timestamptz not null default now(),
  finished_at timestamptz null
);

create index if not exists idx_operacao_jobs_modulo_created_at
  on judiciario.operacao_jobs (modulo, created_at desc);

create index if not exists idx_operacao_jobs_status_created_at
  on judiciario.operacao_jobs (status, created_at desc);

grant usage on schema judiciario to authenticated, service_role;
grant select, insert, update on table judiciario.operacao_jobs to authenticated, service_role;
grant select on table judiciario.operacao_jobs to anon;

commit;
