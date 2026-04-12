create table if not exists public.hmadv_market_ads_template_usage (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.hmadv_market_ads_templates(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  campaign_id uuid references public.hmadv_market_ads_campaigns(id) on delete set null,
  usage_type text not null default 'generator',
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_hmadv_market_ads_template_usage_template_id on public.hmadv_market_ads_template_usage(template_id);
create index if not exists idx_hmadv_market_ads_template_usage_created_at on public.hmadv_market_ads_template_usage(created_at desc);

alter table public.hmadv_market_ads_template_usage enable row level security;

drop policy if exists "hmadv_market_ads_template_usage_admin_read" on public.hmadv_market_ads_template_usage;
create policy "hmadv_market_ads_template_usage_admin_read"
on public.hmadv_market_ads_template_usage
for select
to authenticated
using (
  exists (
    select 1 from public.admin_profiles ap
    where ap.id = auth.uid() and ap.is_active = true
  )
);

drop policy if exists "hmadv_market_ads_template_usage_admin_write" on public.hmadv_market_ads_template_usage;
create policy "hmadv_market_ads_template_usage_admin_write"
on public.hmadv_market_ads_template_usage
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
