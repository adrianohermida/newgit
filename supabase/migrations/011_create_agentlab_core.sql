create extension if not exists pgcrypto;

create table if not exists public.agentlab_agent_profiles (
  id uuid primary key default gen_random_uuid(),
  agent_ref text not null unique,
  business_goal text,
  persona_prompt text,
  response_policy text,
  knowledge_strategy jsonb not null default '[]'::jsonb,
  workflow_strategy jsonb not null default '[]'::jsonb,
  handoff_rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentlab_improvement_queue (
  id uuid primary key default gen_random_uuid(),
  agent_ref text,
  category text not null,
  title text not null,
  description text,
  priority text not null default 'media',
  status text not null default 'backlog',
  source_channel text,
  sprint_bucket text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentlab_conversation_threads (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_conversation_id text not null,
  workspace_id uuid,
  contact_id uuid,
  process_id uuid,
  channel text,
  status text,
  subject text,
  last_message text,
  started_at timestamptz,
  last_message_at timestamptz,
  assigned_to uuid,
  sentiment_label text,
  urgency_label text,
  intent_label text,
  handoff_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentlab_incidents (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  category text not null,
  severity text not null default 'media',
  status text not null default 'open',
  title text not null,
  description text,
  agent_ref text,
  conversation_id uuid,
  internal_user_id uuid,
  internal_user_email text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentlab_source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  sync_scope text not null,
  status text not null default 'completed',
  records_synced integer not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agentlab_training_scenarios (
  id uuid primary key default gen_random_uuid(),
  agent_ref text not null,
  scenario_name text not null,
  category text not null,
  user_message text not null,
  expected_intent text,
  expected_outcome text,
  expected_workflow text,
  expected_knowledge_pack text,
  expected_handoff boolean not null default false,
  difficulty text default 'media',
  score_threshold numeric not null default 0.85,
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agentlab_training_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid references public.agentlab_training_scenarios(id) on delete cascade,
  agent_ref text not null,
  provider text not null,
  model text,
  prompt_version text,
  generated_response text,
  evaluator_summary text,
  intent_detected text,
  handoff_recommended boolean not null default false,
  scores jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  raw_result jsonb not null default '{}'::jsonb,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);
