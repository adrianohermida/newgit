create table if not exists public.agentlab_source_states (
  source_name text primary key,
  cursor text null,
  page integer not null default 1,
  items_per_page integer not null default 20,
  last_synced_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_agentlab_conversation_threads_source_unique
  on public.agentlab_conversation_threads (source_system, source_conversation_id);
