create table if not exists public.hmadv_market_ads_attributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  campaign_id uuid references public.hmadv_market_ads_campaigns(id) on delete set null,
  ad_item_id uuid references public.hmadv_market_ads_items(id) on delete set null,
  template_id uuid references public.hmadv_market_ads_templates(id) on delete set null,
  lead_name text,
  lead_email text,
  lead_phone text,
  stage text not null default 'lead',
  source text not null default 'google',
  medium text,
  campaign_utm text,
  content_utm text,
  term_utm text,
  value numeric(12,2) not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_hmadv_market_ads_attributions_campaign_id on public.hmadv_market_ads_attributions(campaign_id);
create index if not exists idx_hmadv_market_ads_attributions_stage on public.hmadv_market_ads_attributions(stage);
create index if not exists idx_hmadv_market_ads_attributions_created_at on public.hmadv_market_ads_attributions(created_at desc);

alter table public.hmadv_market_ads_attributions enable row level security;

drop policy if exists "hmadv_market_ads_attributions_admin_read" on public.hmadv_market_ads_attributions;
create policy "hmadv_market_ads_attributions_admin_read"
on public.hmadv_market_ads_attributions
for select
to authenticated
using (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
);

drop policy if exists "hmadv_market_ads_attributions_admin_write" on public.hmadv_market_ads_attributions;
create policy "hmadv_market_ads_attributions_admin_write"
on public.hmadv_market_ads_attributions
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
