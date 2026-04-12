alter table public.hmadv_market_ads_templates
add column if not exists visibility text not null default 'privado';

create index if not exists idx_hmadv_market_ads_templates_visibility
on public.hmadv_market_ads_templates(visibility);
