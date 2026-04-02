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
