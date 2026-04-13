begin;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'judiciario'
      and table_name = 'processos'
  ) then
    execute $sql$
      create table if not exists judiciario.processo_cobertura_sync (
        processo_id uuid primary key references judiciario.processos(id) on delete cascade,
        numero_cnj text null,
        account_id_freshsales text null,
        coverage_pct integer not null default 0,
        has_account boolean not null default false,
        details_ok boolean not null default false,
        has_movements boolean not null default false,
        parts_ok boolean not null default false,
        publications_ok boolean not null default false,
        movements_ok boolean not null default false,
        hearings_ok boolean not null default false,
        crm_gap boolean not null default false,
        pending_labels jsonb not null default '[]'::jsonb,
        summary jsonb not null default '{}'::jsonb,
        last_sync_at timestamptz not null default now(),
        last_error text null
      )
    $sql$;
  else
    execute $sql$
      create table if not exists judiciario.processo_cobertura_sync (
        processo_id uuid primary key,
        numero_cnj text null,
        account_id_freshsales text null,
        coverage_pct integer not null default 0,
        has_account boolean not null default false,
        details_ok boolean not null default false,
        has_movements boolean not null default false,
        parts_ok boolean not null default false,
        publications_ok boolean not null default false,
        movements_ok boolean not null default false,
        hearings_ok boolean not null default false,
        crm_gap boolean not null default false,
        pending_labels jsonb not null default '[]'::jsonb,
        summary jsonb not null default '{}'::jsonb,
        last_sync_at timestamptz not null default now(),
        last_error text null
      )
    $sql$;
  end if;
end
$$;

create index if not exists idx_processo_cobertura_sync_last_sync_at
  on judiciario.processo_cobertura_sync (last_sync_at desc);

create index if not exists idx_processo_cobertura_sync_coverage_pct
  on judiciario.processo_cobertura_sync (coverage_pct asc);

grant usage on schema judiciario to authenticated, service_role;
grant select, insert, update on table judiciario.processo_cobertura_sync to authenticated, service_role;
grant select on table judiciario.processo_cobertura_sync to anon;

commit;
