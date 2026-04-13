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

alter table if exists public.agentlab_conversation_messages
  add column if not exists source_system text;

alter table if exists public.agentlab_conversation_messages
  add column if not exists source_conversation_id text;

alter table if exists public.agentlab_conversation_messages
  add column if not exists source_message_id text;

alter table if exists public.agentlab_conversation_messages
  add column if not exists actor_type text;

alter table if exists public.agentlab_conversation_messages
  add column if not exists actor_id text;

alter table if exists public.agentlab_conversation_messages
  add column if not exists message_type text;

alter table if exists public.agentlab_conversation_messages
  add column if not exists body_text text;

alter table if exists public.agentlab_conversation_messages
  add column if not exists created_at_source timestamptz;

alter table if exists public.agentlab_conversation_messages
  add column if not exists updated_at timestamptz not null default now();

update public.agentlab_conversation_messages
set
  source_system = coalesce(source_system, 'workspace_conversas'),
  source_conversation_id = coalesce(source_conversation_id, thread_id::text),
  source_message_id = coalesce(source_message_id, id::text),
  actor_type = coalesce(actor_type, direction),
  body_text = coalesce(body_text, body),
  created_at_source = coalesce(created_at_source, created_at)
where
  source_system is null
  or source_conversation_id is null
  or source_message_id is null
  or actor_type is null
  or body_text is null
  or created_at_source is null;

alter table if exists public.agentlab_conversation_messages
  alter column source_system set not null;

alter table if exists public.agentlab_conversation_messages
  alter column source_conversation_id set not null;

alter table if exists public.agentlab_conversation_messages
  alter column source_message_id set not null;

create unique index if not exists idx_agentlab_conversation_messages_source_unique
  on public.agentlab_conversation_messages (source_system, source_conversation_id, source_message_id);

create index if not exists idx_agentlab_conversation_messages_thread
  on public.agentlab_conversation_messages (thread_id, created_at_source desc);
