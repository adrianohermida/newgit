create extension if not exists pgcrypto;

create table if not exists public.freshsales_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  freshsales_contact_id text not null unique,
  name text,
  email text,
  email_normalized text,
  phone text,
  phone_normalized text,
  lifecycle_stage text,
  meeting_stage text,
  negotiation_stage text,
  closing_stage text,
  client_stage text,
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_freshsales_contacts_workspace_id
  on public.freshsales_contacts (workspace_id);

create index if not exists idx_freshsales_contacts_email_normalized
  on public.freshsales_contacts (email_normalized);

create index if not exists idx_freshsales_contacts_phone_normalized
  on public.freshsales_contacts (phone_normalized);

create table if not exists public.freshsales_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  freshsales_product_id text unique,
  name text not null,
  category text,
  billing_type text,
  price_default numeric(14,2),
  currency text not null default 'BRL',
  late_fee_percent_default numeric(8,4) not null default 10,
  interest_percent_month_default numeric(8,4) not null default 1,
  monetary_index_default text not null default 'IGP-M',
  installments_default integer,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_freshsales_products_workspace_id
  on public.freshsales_products (workspace_id);

create index if not exists idx_freshsales_products_category
  on public.freshsales_products (category);

create unique index if not exists uq_freshsales_products_name
  on public.freshsales_products (name);

create table if not exists public.billing_indices (
  id uuid primary key default gen_random_uuid(),
  index_name text not null,
  month_ref text not null,
  index_value numeric(18,8) not null,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (index_name, month_ref)
);

create index if not exists idx_billing_indices_name_month
  on public.billing_indices (index_name, month_ref desc);

create table if not exists public.billing_import_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  source_name text not null,
  source_file text,
  status text not null default 'pending',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  error_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_import_runs_workspace_id
  on public.billing_import_runs (workspace_id);

create table if not exists public.billing_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.billing_import_runs(id) on delete cascade,
  source_row_number integer,
  raw_payload jsonb not null default '{}'::jsonb,
  person_name text,
  email text,
  email_normalized text,
  invoice_number text,
  invoice_date date,
  due_date date,
  category_raw text,
  comment_raw text,
  deal_reference_raw text,
  amount_original_raw text,
  payment_raw text,
  status_raw text,
  entry_type_raw text,
  entry_direction text,
  canonical_status text,
  billing_type_inferred text,
  product_family_inferred text,
  dedupe_key text,
  is_duplicate boolean not null default false,
  matching_status text not null default 'novo',
  matching_notes text,
  resolved_contact_id uuid references public.freshsales_contacts(id) on delete set null,
  resolved_product_id uuid references public.freshsales_products(id) on delete set null,
  resolved_contract_id uuid,
  resolved_deal_id uuid,
  validation_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_import_rows_import_run_id
  on public.billing_import_rows (import_run_id);

create index if not exists idx_billing_import_rows_email_normalized
  on public.billing_import_rows (email_normalized);

create index if not exists idx_billing_import_rows_dedupe_key
  on public.billing_import_rows (dedupe_key);

create table if not exists public.billing_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  contact_id uuid references public.freshsales_contacts(id) on delete set null,
  freshsales_contact_id text,
  product_id uuid references public.freshsales_products(id) on delete set null,
  freshsales_product_id text,
  contract_kind text not null,
  title text not null,
  process_reference text,
  external_reference text,
  start_date date,
  end_date date,
  status text not null default 'active',
  currency text not null default 'BRL',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_contracts_workspace_id
  on public.billing_contracts (workspace_id);

create index if not exists idx_billing_contracts_contact_id
  on public.billing_contracts (contact_id);

create unique index if not exists uq_billing_contracts_external_reference
  on public.billing_contracts (external_reference)
  where external_reference is not null;

create table if not exists public.billing_receivables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  contract_id uuid references public.billing_contracts(id) on delete cascade,
  contact_id uuid references public.freshsales_contacts(id) on delete set null,
  product_id uuid references public.freshsales_products(id) on delete set null,
  source_import_row_id uuid references public.billing_import_rows(id) on delete set null,
  freshsales_deal_id text,
  receivable_type text not null,
  invoice_number text,
  description text,
  issue_date date,
  due_date date,
  status text not null default 'em_aberto',
  currency text not null default 'BRL',
  amount_original numeric(14,2) not null default 0,
  payment_amount numeric(14,2) not null default 0,
  amount_principal numeric(14,2),
  correction_index_name text not null default 'IGP-M',
  correction_index_due numeric(18,8),
  correction_index_current numeric(18,8),
  correction_factor numeric(18,8),
  correction_percent numeric(18,8),
  correction_amount numeric(14,2),
  amount_corrected numeric(14,2),
  late_fee_percent numeric(8,4) not null default 10,
  late_fee_amount numeric(14,2),
  interest_mora_percent_month numeric(8,4) not null default 1,
  interest_mora_amount numeric(14,2),
  interest_compensatory_percent_month numeric(8,4) not null default 1,
  interest_compensatory_amount numeric(14,2),
  interest_start_date date,
  days_overdue integer,
  balance_due numeric(14,2),
  balance_due_corrected numeric(14,2),
  calculated_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_receivables_workspace_id
  on public.billing_receivables (workspace_id);

create index if not exists idx_billing_receivables_contract_id
  on public.billing_receivables (contract_id);

create index if not exists idx_billing_receivables_contact_id
  on public.billing_receivables (contact_id);

create index if not exists idx_billing_receivables_status_due_date
  on public.billing_receivables (status, due_date);

create unique index if not exists uq_billing_receivables_source_import_row_id
  on public.billing_receivables (source_import_row_id)
  where source_import_row_id is not null;

create table if not exists public.freshsales_deals_registry (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  billing_receivable_id uuid references public.billing_receivables(id) on delete cascade,
  freshsales_deal_id text not null unique,
  freshsales_contact_id text,
  freshsales_product_id text,
  deal_name text,
  deal_stage text,
  deal_status text,
  amount_last_sent numeric(14,2),
  payload_last_sent jsonb not null default '{}'::jsonb,
  last_sync_status text,
  last_sync_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_event_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_freshsales_deals_registry_workspace_id
  on public.freshsales_deals_registry (workspace_id);

create unique index if not exists uq_freshsales_deals_registry_billing_receivable_id
  on public.freshsales_deals_registry (billing_receivable_id)
  where billing_receivable_id is not null;

create index if not exists idx_crm_event_queue_status_scheduled
  on public.crm_event_queue (status, scheduled_at);

alter table public.freshsales_contacts enable row level security;
alter table public.freshsales_products enable row level security;
alter table public.billing_indices enable row level security;
alter table public.billing_import_runs enable row level security;
alter table public.billing_import_rows enable row level security;
alter table public.billing_contracts enable row level security;
alter table public.billing_receivables enable row level security;
alter table public.freshsales_deals_registry enable row level security;
alter table public.crm_event_queue enable row level security;

create or replace function public.billing_month_ref(target_date date)
returns text
language sql
immutable
as $$
  select to_char(target_date, 'YYYY-MM');
$$;

create or replace function public.recalculate_billing_receivable(
  p_receivable_id uuid,
  p_as_of_date date default current_date
)
returns public.billing_receivables
language plpgsql
as $$
declare
  v_row public.billing_receivables%rowtype;
  v_due_month text;
  v_current_month text;
  v_due_index numeric(18,8);
  v_current_index numeric(18,8);
  v_amount_principal numeric(14,2);
  v_correction_factor numeric(18,8);
  v_amount_corrected numeric(14,2);
  v_correction_percent numeric(18,8);
  v_correction_amount numeric(14,2);
  v_late_fee_amount numeric(14,2);
  v_days_overdue integer;
  v_months_overdue numeric(18,8);
  v_interest_mora_amount numeric(14,2);
  v_interest_comp_amount numeric(14,2);
  v_interest_start_date date;
  v_balance_due numeric(14,2);
  v_balance_due_corrected numeric(14,2);
begin
  select *
  into v_row
  from public.billing_receivables
  where id = p_receivable_id
  for update;

  if not found then
    raise exception 'billing_receivable_not_found: %', p_receivable_id;
  end if;

  if v_row.status in ('pago', 'quitado', 'encerrado') or v_row.due_date is null then
    return v_row;
  end if;

  v_due_month := public.billing_month_ref(v_row.due_date);
  v_current_month := public.billing_month_ref(p_as_of_date);

  select bi.index_value into v_due_index
  from public.billing_indices bi
  where bi.index_name = v_row.correction_index_name
    and bi.month_ref = v_due_month
  limit 1;

  if v_due_index is null then
    select bi.index_value into v_due_index
    from public.billing_indices bi
    where bi.index_name = v_row.correction_index_name
      and bi.month_ref <= v_due_month
    order by bi.month_ref desc
    limit 1;
  end if;

  if v_due_index is null then
    select bi.index_value into v_due_index
    from public.billing_indices bi
    where bi.index_name = v_row.correction_index_name
    order by bi.month_ref asc
    limit 1;
  end if;

  select bi.index_value into v_current_index
  from public.billing_indices bi
  where bi.index_name = v_row.correction_index_name
    and bi.month_ref = v_current_month
  limit 1;

  if v_current_index is null then
    select bi.index_value into v_current_index
    from public.billing_indices bi
    where bi.index_name = v_row.correction_index_name
    order by bi.month_ref desc
    limit 1;
  end if;

  v_amount_principal := round((coalesce(v_row.amount_original, 0) - coalesce(v_row.payment_amount, 0))::numeric, 2);

  if p_as_of_date <= v_row.due_date then
    v_days_overdue := 0;
  else
    v_days_overdue := p_as_of_date - v_row.due_date;
  end if;

  v_interest_start_date := v_row.due_date + 1;

  if v_due_index is not null and v_current_index is not null and v_due_index > 0 then
    v_correction_factor := round((v_current_index / v_due_index)::numeric, 8);
    v_amount_corrected := round((v_amount_principal * v_correction_factor)::numeric, 2);
    v_correction_percent := round(((v_correction_factor - 1) * 100)::numeric, 8);
    v_correction_amount := round((v_amount_corrected - v_amount_principal)::numeric, 2);
  else
    v_correction_factor := null;
    v_amount_corrected := v_amount_principal;
    v_correction_percent := null;
    v_correction_amount := null;
  end if;

  v_late_fee_amount := round((coalesce(v_row.amount_original, 0) * (coalesce(v_row.late_fee_percent, 0) / 100))::numeric, 2);
  v_months_overdue := greatest(v_days_overdue, 0) / 30.0;
  v_interest_mora_amount := round((coalesce(v_row.amount_original, 0) * (coalesce(v_row.interest_mora_percent_month, 0) / 100) * v_months_overdue)::numeric, 2);
  v_interest_comp_amount := round((coalesce(v_row.amount_original, 0) * (coalesce(v_row.interest_compensatory_percent_month, 0) / 100) * v_months_overdue)::numeric, 2);

  v_balance_due := round((coalesce(v_row.amount_original, 0) + v_late_fee_amount + v_interest_mora_amount + v_interest_comp_amount)::numeric, 2);
  v_balance_due_corrected := round((coalesce(v_amount_corrected, v_amount_principal, 0) + v_late_fee_amount + v_interest_mora_amount + v_interest_comp_amount)::numeric, 2);

  update public.billing_receivables
  set amount_principal = v_amount_principal,
      correction_index_due = v_due_index,
      correction_index_current = v_current_index,
      correction_factor = v_correction_factor,
      correction_percent = v_correction_percent,
      correction_amount = v_correction_amount,
      amount_corrected = v_amount_corrected,
      late_fee_amount = v_late_fee_amount,
      interest_mora_amount = v_interest_mora_amount,
      interest_compensatory_amount = v_interest_comp_amount,
      interest_start_date = v_interest_start_date,
      days_overdue = v_days_overdue,
      balance_due = v_balance_due,
      balance_due_corrected = v_balance_due_corrected,
      calculated_at = now(),
      updated_at = now()
  where id = p_receivable_id
  returning *
  into v_row;

  return v_row;
end;
$$;

create or replace function public.recalculate_open_billing_receivables(
  p_as_of_date date default current_date
)
returns integer
language plpgsql
as $$
declare
  v_row record;
  v_total integer := 0;
begin
  for v_row in
    select id
    from public.billing_receivables
    where status not in ('pago', 'quitado', 'encerrado')
  loop
    perform public.recalculate_billing_receivable(v_row.id, p_as_of_date);
    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;
