create table if not exists public.agentlab_widget_events (
  id uuid primary key,
  source text not null default 'freshchat_web',
  event_name text not null,
  route_path text,
  identity_mode text,
  reference_id text,
  success boolean,
  widget_state text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agentlab_widget_events_created_at_idx
  on public.agentlab_widget_events (created_at desc);

create index if not exists agentlab_widget_events_event_name_idx
  on public.agentlab_widget_events (event_name);
