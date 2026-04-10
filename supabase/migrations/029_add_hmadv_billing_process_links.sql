alter table if exists public.billing_import_rows
  add column if not exists resolved_process_id uuid,
  add column if not exists resolved_account_id_freshsales text,
  add column if not exists resolved_process_reference text;

alter table if exists public.billing_contracts
  add column if not exists process_id uuid,
  add column if not exists freshsales_account_id text;

alter table if exists public.billing_receivables
  add column if not exists process_id uuid,
  add column if not exists freshsales_account_id text;

alter table if exists public.freshsales_deals_registry
  add column if not exists freshsales_account_id text;

create index if not exists idx_billing_import_rows_resolved_process_id
  on public.billing_import_rows (resolved_process_id);

create index if not exists idx_billing_import_rows_resolved_account_id_freshsales
  on public.billing_import_rows (resolved_account_id_freshsales);

create index if not exists idx_billing_contracts_process_id
  on public.billing_contracts (process_id);

create index if not exists idx_billing_contracts_freshsales_account_id
  on public.billing_contracts (freshsales_account_id);

create index if not exists idx_billing_receivables_process_id
  on public.billing_receivables (process_id);

create index if not exists idx_billing_receivables_freshsales_account_id
  on public.billing_receivables (freshsales_account_id);
