create table if not exists public.hmadv_finance_admin_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_hmadv_finance_admin_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_hmadv_finance_admin_settings_updated_at on public.hmadv_finance_admin_settings;
create trigger trg_hmadv_finance_admin_settings_updated_at
before update on public.hmadv_finance_admin_settings
for each row
execute function public.set_hmadv_finance_admin_settings_updated_at();

insert into public.hmadv_finance_admin_settings (key, value, description)
values (
  'default',
  jsonb_build_object(
    'backfill_limit', 50,
    'materialize_workspace_id', null,
    'reprocess_limit', 3000,
    'publish_limit', 50,
    'crm_events_limit', 50,
    'freshsales_owner_id', null
  ),
  'Configuracao operacional do modulo administrativo financeiro HMADV.'
)
on conflict (key) do nothing;
