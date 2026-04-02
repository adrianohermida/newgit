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
