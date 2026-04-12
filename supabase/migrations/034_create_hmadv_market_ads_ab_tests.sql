create table if not exists public.hmadv_market_ads_ab_tests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.hmadv_market_ads_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  legal_area text,
  hypothesis text not null,
  metric text not null default 'CTR',
  variant_a_label text not null default 'Variante A',
  variant_b_label text not null default 'Variante B',
  winner text,
  uplift numeric(10,2) not null default 0,
  status text not null default 'draft',
  recommendation text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_hmadv_market_ads_ab_tests_campaign_id on public.hmadv_market_ads_ab_tests(campaign_id);
create index if not exists idx_hmadv_market_ads_ab_tests_created_at on public.hmadv_market_ads_ab_tests(created_at desc);

alter table public.hmadv_market_ads_ab_tests enable row level security;

drop policy if exists "hmadv_market_ads_ab_tests_admin_read" on public.hmadv_market_ads_ab_tests;
create policy "hmadv_market_ads_ab_tests_admin_read"
on public.hmadv_market_ads_ab_tests
for select
to authenticated
using (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
);

drop policy if exists "hmadv_market_ads_ab_tests_admin_write" on public.hmadv_market_ads_ab_tests;
create policy "hmadv_market_ads_ab_tests_admin_write"
on public.hmadv_market_ads_ab_tests
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
