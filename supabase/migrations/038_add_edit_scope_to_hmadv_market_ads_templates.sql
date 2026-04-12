alter table public.hmadv_market_ads_templates
add column if not exists edit_scope text not null default 'admins';

create index if not exists idx_hmadv_market_ads_templates_edit_scope
on public.hmadv_market_ads_templates(edit_scope);
