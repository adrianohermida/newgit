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
