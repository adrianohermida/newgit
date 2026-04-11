create table if not exists public.hmadv_market_ads_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.hmadv_market_ads_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  platform text not null,
  status text not null default 'draft',
  headline text not null,
  description text not null,
  cta text not null,
  creative_hint text,
  audience text,
  keyword_suggestions jsonb not null default '[]'::jsonb,
  compliance_score integer not null default 0,
  compliance_status text not null default 'revisao',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_hmadv_market_ads_items_campaign_id on public.hmadv_market_ads_items(campaign_id);
create index if not exists idx_hmadv_market_ads_items_created_at on public.hmadv_market_ads_items(created_at desc);

alter table public.hmadv_market_ads_items enable row level security;

drop policy if exists "hmadv_market_ads_items_admin_read" on public.hmadv_market_ads_items;
create policy "hmadv_market_ads_items_admin_read"
on public.hmadv_market_ads_items
for select
to authenticated
using (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
);

drop policy if exists "hmadv_market_ads_items_admin_write" on public.hmadv_market_ads_items;
create policy "hmadv_market_ads_items_admin_write"
on public.hmadv_market_ads_items
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
