create extension if not exists pgcrypto;

create table if not exists public.freshsales_sync_runs (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  filter_id text,
  filter_name text,
  page integer not null default 1,
  limit_count integer not null default 10,
  source_base_url text not null,
  source_total integer,
  status text not null default 'completed',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_synced integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  error jsonb
);

create table if not exists public.freshsales_sync_snapshots (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.freshsales_sync_runs(id) on delete set null,
  entity text not null,
  source_id text not null,
  external_id text,
  display_name text,
  owner_id text,
  status text,
  emails jsonb not null default '[]'::jsonb,
  phones jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  custom_attributes jsonb not null default '{}'::jsonb,
  relationships jsonb not null default '{}'::jsonb,
  timestamps jsonb not null default '{}'::jsonb,
  raw_payload jsonb,
  source_base_url text not null,
  source_filter_id text,
  source_filter_name text,
  synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity, source_id)
);

create index if not exists idx_freshsales_sync_runs_entity_started_at
  on public.freshsales_sync_runs (entity, started_at desc);

create index if not exists idx_freshsales_sync_snapshots_entity_display_name
  on public.freshsales_sync_snapshots (entity, display_name);

create index if not exists idx_freshsales_sync_snapshots_sync_run_id
  on public.freshsales_sync_snapshots (sync_run_id);

create or replace function public.set_freshsales_sync_snapshot_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_freshsales_sync_snapshots_updated_at on public.freshsales_sync_snapshots;

create trigger trg_freshsales_sync_snapshots_updated_at
before update on public.freshsales_sync_snapshots
for each row
execute function public.set_freshsales_sync_snapshot_updated_at();

alter table public.freshsales_sync_runs enable row level security;
alter table public.freshsales_sync_snapshots enable row level security;
