create table if not exists public.hmadv_market_ads_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  source text not null default 'library',
  platform text not null,
  legal_area text,
  audience text,
  objective text,
  headline text not null,
  compliance_status text not null default 'revisao',
  score integer not null default 0,
  structure jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_favorite boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_hmadv_market_ads_templates_created_at on public.hmadv_market_ads_templates(created_at desc);
create index if not exists idx_hmadv_market_ads_templates_favorite on public.hmadv_market_ads_templates(is_favorite);

alter table public.hmadv_market_ads_templates enable row level security;

drop policy if exists "hmadv_market_ads_templates_admin_read" on public.hmadv_market_ads_templates;
create policy "hmadv_market_ads_templates_admin_read"
on public.hmadv_market_ads_templates
for select
to authenticated
using (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
);

drop policy if exists "hmadv_market_ads_templates_admin_write" on public.hmadv_market_ads_templates;
create policy "hmadv_market_ads_templates_admin_write"
on public.hmadv_market_ads_templates
for all
to authenticated
using (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
)
with check (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
);
