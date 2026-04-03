create table if not exists public.agentlab_quick_replies (
  id uuid primary key default gen_random_uuid(),
  agent_ref text,
  category text not null,
  title text not null,
  shortcut text,
  body text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentlab_intents (
  id uuid primary key default gen_random_uuid(),
  agent_ref text,
  label text not null,
  examples jsonb not null default '[]'::jsonb,
  policy text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentlab_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  agent_ref text,
  source_type text not null,
  title text not null,
  status text not null default 'draft',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentlab_workflow_library (
  id uuid primary key default gen_random_uuid(),
  agent_ref text,
  title text not null,
  type text,
  status text not null default 'backlog',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agentlab_quick_replies_agent_ref on public.agentlab_quick_replies(agent_ref);
create index if not exists idx_agentlab_intents_agent_ref on public.agentlab_intents(agent_ref);
create index if not exists idx_agentlab_knowledge_sources_agent_ref on public.agentlab_knowledge_sources(agent_ref);
create index if not exists idx_agentlab_workflow_library_agent_ref on public.agentlab_workflow_library(agent_ref);
