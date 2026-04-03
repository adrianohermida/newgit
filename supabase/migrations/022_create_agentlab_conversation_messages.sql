create table if not exists public.agentlab_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid null references public.agentlab_conversation_threads (id) on delete set null,
  source_system text not null,
  source_conversation_id text not null,
  source_message_id text not null,
  actor_type text null,
  actor_id text null,
  message_type text null,
  body_text text null,
  created_at_source timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_agentlab_conversation_messages_source_unique
  on public.agentlab_conversation_messages (source_system, source_conversation_id, source_message_id);

create index if not exists idx_agentlab_conversation_messages_thread
  on public.agentlab_conversation_messages (thread_id, created_at_source desc);
