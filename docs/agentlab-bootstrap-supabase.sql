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

create table if not exists public.agentlab_crm_automation_rules (
  id uuid primary key,
  event_key text not null,
  title text not null,
  description text,
  pipeline_stage text,
  lifecycle_stage text,
  meeting_stage text,
  negotiation_stage text,
  closing_stage text,
  client_stage text,
  sequence_name text,
  journey_name text,
  email_template text,
  whatsapp_template text,
  enabled boolean not null default true,
  execution_mode text not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agentlab_crm_automation_rules_event_key
  on public.agentlab_crm_automation_rules (event_key);

create table if not exists public.agentlab_crm_automation_runs (
  id uuid primary key,
  rule_id uuid,
  event_key text not null,
  source_system text,
  source_ref text,
  agent_ref text,
  status text not null default 'planned',
  execution_mode text not null default 'manual',
  pipeline_stage text,
  lifecycle_stage text,
  meeting_stage text,
  negotiation_stage text,
  closing_stage text,
  client_stage text,
  sequence_name text,
  journey_name text,
  email_template text,
  whatsapp_template text,
  notes text,
  planned_actions jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agentlab_crm_automation_runs_event_key
  on public.agentlab_crm_automation_runs (event_key);

create index if not exists idx_agentlab_crm_automation_runs_source_ref
  on public.agentlab_crm_automation_runs (source_ref);

create table if not exists public.agentlab_crm_resource_map (
  id uuid primary key,
  resource_key text not null,
  resource_type text not null,
  resource_id text not null,
  resource_name text,
  provider text not null default 'freshsales',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_agentlab_crm_resource_map_key
  on public.agentlab_crm_resource_map (resource_key);

create index if not exists idx_agentlab_crm_resource_map_type
  on public.agentlab_crm_resource_map (resource_type);

create table if not exists public.agentlab_crm_dispatch_runs (
  id uuid primary key,
  automation_run_id uuid,
  channel text not null,
  template_name text,
  recipient_ref text,
  status text not null default 'queued',
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agentlab_crm_dispatch_runs_channel
  on public.agentlab_crm_dispatch_runs (channel);

create index if not exists idx_agentlab_crm_dispatch_runs_status
  on public.agentlab_crm_dispatch_runs (status);

create table if not exists public.agentlab_message_templates (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'email',
  template_name text not null,
  subject text null,
  body_html text null,
  body_text text null,
  enabled boolean not null default true,
  notes text null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists agentlab_message_templates_channel_template_name_idx
  on public.agentlab_message_templates (channel, template_name);

create index if not exists agentlab_message_templates_updated_at_idx
  on public.agentlab_message_templates (updated_at desc);

create table if not exists public.agentlab_crm_action_queue (
  id uuid primary key default gen_random_uuid(),
  automation_run_id uuid null,
  source_ref text null,
  event_key text not null,
  action_type text not null,
  resource_type text not null,
  resource_key text null,
  resource_id text null,
  resource_name text null,
  status text not null default 'pending',
  execution_mode text not null default 'semi_auto',
  detail text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists agentlab_crm_action_queue_status_idx
  on public.agentlab_crm_action_queue (status, created_at desc);

create index if not exists agentlab_crm_action_queue_event_idx
  on public.agentlab_crm_action_queue (event_key, created_at desc);

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
