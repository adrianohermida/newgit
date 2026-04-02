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
