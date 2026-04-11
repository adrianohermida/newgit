create table if not exists public.agentlab_source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  sync_scope text not null default 'conversation_intelligence',
  status text not null default 'completed',
  records_synced integer not null default 0,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists agentlab_source_sync_runs_source_idx
  on public.agentlab_source_sync_runs (source_name, created_at desc);

alter table public.agentlab_source_sync_runs enable row level security;
