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
