-- Migration: 027_create_dotobot_task_runs
-- Description: Persistencia primaria de TaskRun (runs + eventos) para AI Task/Lawdesk.

create extension if not exists pgcrypto;

create table if not exists public.dotobot_task_runs (
  id text primary key,
  mission text not null,
  mode text not null default 'assisted',
  provider text not null default 'gpt',
  status text not null default 'queued',
  route text null,
  actor_profile jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dotobot_task_run_events (
  id text primary key,
  run_id text not null references public.dotobot_task_runs(id) on delete cascade,
  event_type text not null,
  message text null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_dotobot_task_runs_status
  on public.dotobot_task_runs (status, updated_at desc);

create index if not exists idx_dotobot_task_runs_created_at
  on public.dotobot_task_runs (created_at desc);

create index if not exists idx_dotobot_task_run_events_run
  on public.dotobot_task_run_events (run_id, created_at asc);

alter table public.dotobot_task_runs enable row level security;
alter table public.dotobot_task_run_events enable row level security;

drop policy if exists dotobot_task_runs_service_all on public.dotobot_task_runs;
drop policy if exists dotobot_task_runs_authenticated_read on public.dotobot_task_runs;
drop policy if exists dotobot_task_run_events_service_all on public.dotobot_task_run_events;
drop policy if exists dotobot_task_run_events_authenticated_read on public.dotobot_task_run_events;

create policy dotobot_task_runs_service_all
  on public.dotobot_task_runs
  for all
  to service_role
  using (true)
  with check (true);

create policy dotobot_task_runs_authenticated_read
  on public.dotobot_task_runs
  for select
  to authenticated
  using (true);

create policy dotobot_task_run_events_service_all
  on public.dotobot_task_run_events
  for all
  to service_role
  using (true)
  with check (true);

create policy dotobot_task_run_events_authenticated_read
  on public.dotobot_task_run_events
  for select
  to authenticated
  using (true);
