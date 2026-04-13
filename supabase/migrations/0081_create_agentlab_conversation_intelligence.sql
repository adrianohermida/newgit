create extension if not exists pgcrypto;

create or replace function public.set_agentlab_intelligence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.agentlab_conversation_threads (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'workspace',
  source_conversation_id text not null,
  workspace_id uuid null,
  contact_id uuid null,
  process_id uuid null,
  channel text not null default 'desconhecido',
  status text not null default 'open',
  subject text null,
  last_message text null,
  started_at timestamptz null,
  last_message_at timestamptz null,
  assigned_to uuid null,
  sentiment_label text null,
  urgency_label text null,
  intent_label text null,
  handoff_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (source_system, source_conversation_id)
);

create index if not exists agentlab_conversation_threads_channel_idx
  on public.agentlab_conversation_threads (channel);

create index if not exists agentlab_conversation_threads_status_idx
  on public.agentlab_conversation_threads (status);

create index if not exists agentlab_conversation_threads_last_message_at_idx
  on public.agentlab_conversation_threads (last_message_at desc);

create trigger set_agentlab_conversation_threads_updated_at
before update on public.agentlab_conversation_threads
for each row
execute function public.set_agentlab_intelligence_updated_at();

create table if not exists public.agentlab_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.agentlab_conversation_threads(id) on delete cascade,
  source_message_id text null,
  direction text not null default 'inbound',
  role text not null default 'user',
  body text null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists agentlab_conversation_messages_thread_id_idx
  on public.agentlab_conversation_messages (thread_id, created_at desc);

create table if not exists public.agentlab_incidents (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'agentlab',
  category text not null default 'operacional',
  severity text not null default 'media',
  status text not null default 'open',
  title text not null,
  description text null,
  agent_ref text null,
  conversation_id uuid null references public.agentlab_conversation_threads(id) on delete set null,
  internal_user_id uuid null,
  internal_user_email text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists agentlab_incidents_status_idx
  on public.agentlab_incidents (status, severity);

create index if not exists agentlab_incidents_occurred_at_idx
  on public.agentlab_incidents (occurred_at desc);

create trigger set_agentlab_incidents_updated_at
before update on public.agentlab_incidents
for each row
execute function public.set_agentlab_intelligence_updated_at();

alter table public.agentlab_conversation_threads enable row level security;
alter table public.agentlab_conversation_messages enable row level security;
alter table public.agentlab_incidents enable row level security;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'conversas'
  ) then
    insert into public.agentlab_conversation_threads (
      source_system,
      source_conversation_id,
      workspace_id,
      contact_id,
      process_id,
      channel,
      status,
      subject,
      last_message,
      started_at,
      last_message_at,
      assigned_to,
      metadata,
      raw_payload
    )
    select
      'workspace_conversas',
      c.id::text,
      c.workspace_id,
      c.contato_id,
      c.processo_id,
      coalesce(c.canal, 'desconhecido'),
      coalesce(c.status, 'open'),
      coalesce(c.assunto, 'Sem assunto'),
      c.ultima_mensagem,
      coalesce(c.created_date, c.created_at),
      coalesce(c.last_message_at, c.ultima_mensagem_at, c.updated_date, c.updated_at),
      c.assigned_to,
      coalesce(c.metadata, '{}'::jsonb),
      to_jsonb(c)
    from public.conversas c
    where not exists (
      select 1
      from public.agentlab_conversation_threads t
      where t.source_system = 'workspace_conversas'
        and t.source_conversation_id = c.id::text
    );
  end if;
end
$$;
