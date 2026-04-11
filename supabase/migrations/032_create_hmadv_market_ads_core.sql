create extension if not exists "pgcrypto";

create table if not exists public.hmadv_market_ads_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  platform text not null,
  objective text not null,
  status text not null default 'draft',
  legal_area text,
  audience text,
  location text,
  budget numeric(12,2) not null default 0,
  roi numeric(10,2) not null default 0,
  ctr numeric(10,2) not null default 0,
  cpc numeric(10,2) not null default 0,
  cpa numeric(10,2) not null default 0,
  conversion_rate numeric(10,2) not null default 0,
  compliance_status text not null default 'revisao',
  landing_page text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.hmadv_market_ads_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  platform text not null,
  legal_area text not null,
  audience text,
  objective text,
  location text,
  headline text not null,
  description text not null,
  cta text not null,
  creative_hint text,
  audience_suggestion text,
  keyword_suggestions jsonb not null default '[]'::jsonb,
  compliance_score integer not null default 0,
  compliance_status text not null default 'revisao',
  compliance_payload jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.hmadv_market_ads_compliance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  draft_id uuid references public.hmadv_market_ads_drafts(id) on delete set null,
  headline text,
  description text,
  cta text,
  compliance_score integer not null default 0,
  compliance_status text not null default 'revisao',
  approved boolean not null default false,
  violations jsonb not null default '[]'::jsonb,
  revised_copy text,
  guidance text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_hmadv_market_ads_campaigns_status on public.hmadv_market_ads_campaigns(status);
create index if not exists idx_hmadv_market_ads_drafts_created_at on public.hmadv_market_ads_drafts(created_at desc);
create index if not exists idx_hmadv_market_ads_compliance_logs_created_at on public.hmadv_market_ads_compliance_logs(created_at desc);

alter table public.hmadv_market_ads_campaigns enable row level security;
alter table public.hmadv_market_ads_drafts enable row level security;
alter table public.hmadv_market_ads_compliance_logs enable row level security;

drop policy if exists "hmadv_market_ads_campaigns_admin_read" on public.hmadv_market_ads_campaigns;
create policy "hmadv_market_ads_campaigns_admin_read"
on public.hmadv_market_ads_campaigns
for select
to authenticated
using (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
);

drop policy if exists "hmadv_market_ads_campaigns_admin_write" on public.hmadv_market_ads_campaigns;
create policy "hmadv_market_ads_campaigns_admin_write"
on public.hmadv_market_ads_campaigns
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

drop policy if exists "hmadv_market_ads_drafts_admin_read" on public.hmadv_market_ads_drafts;
create policy "hmadv_market_ads_drafts_admin_read"
on public.hmadv_market_ads_drafts
for select
to authenticated
using (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
);

drop policy if exists "hmadv_market_ads_drafts_admin_write" on public.hmadv_market_ads_drafts;
create policy "hmadv_market_ads_drafts_admin_write"
on public.hmadv_market_ads_drafts
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

drop policy if exists "hmadv_market_ads_compliance_logs_admin_read" on public.hmadv_market_ads_compliance_logs;
create policy "hmadv_market_ads_compliance_logs_admin_read"
on public.hmadv_market_ads_compliance_logs
for select
to authenticated
using (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
);

drop policy if exists "hmadv_market_ads_compliance_logs_admin_write" on public.hmadv_market_ads_compliance_logs;
create policy "hmadv_market_ads_compliance_logs_admin_write"
on public.hmadv_market_ads_compliance_logs
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
