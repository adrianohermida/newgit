alter table if exists judiciario.processos
  add column if not exists status_fonte text,
  add column if not exists status_detectado_em timestamptz,
  add column if not exists status_evento_origem text;

alter table if exists judiciario.partes
  add column if not exists representada_pelo_escritorio boolean not null default false,
  add column if not exists cliente_hmadv boolean not null default false,
  add column if not exists contato_freshsales_id text,
  add column if not exists principal_no_account boolean not null default false;

do $$
declare
  has_processos boolean;
  has_partes boolean;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'judiciario'
      and table_name = 'processos'
  ) into has_processos;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'judiciario'
      and table_name = 'partes'
  ) into has_partes;

  if has_processos and has_partes then
    execute $sql$
      create table if not exists judiciario.processo_contato_sync (
        id uuid primary key default gen_random_uuid(),
        processo_id uuid not null references judiciario.processos(id) on delete cascade,
        parte_id uuid null references judiciario.partes(id) on delete set null,
        contact_id_freshsales text not null,
        relacao text null,
        principal boolean not null default false,
        origem text not null default 'partes_publicacoes',
        synced_at timestamptz not null default now(),
        metadata jsonb not null default '{}'::jsonb
      )
    $sql$;
  elsif has_processos then
    execute $sql$
      create table if not exists judiciario.processo_contato_sync (
        id uuid primary key default gen_random_uuid(),
        processo_id uuid not null references judiciario.processos(id) on delete cascade,
        parte_id uuid null,
        contact_id_freshsales text not null,
        relacao text null,
        principal boolean not null default false,
        origem text not null default 'partes_publicacoes',
        synced_at timestamptz not null default now(),
        metadata jsonb not null default '{}'::jsonb
      )
    $sql$;
  else
    execute $sql$
      create table if not exists judiciario.processo_contato_sync (
        id uuid primary key default gen_random_uuid(),
        processo_id uuid not null,
        parte_id uuid null,
        contact_id_freshsales text not null,
        relacao text null,
        principal boolean not null default false,
        origem text not null default 'partes_publicacoes',
        synced_at timestamptz not null default now(),
        metadata jsonb not null default '{}'::jsonb
      )
    $sql$;
  end if;
end
$$;

create unique index if not exists processo_contato_sync_unq
  on judiciario.processo_contato_sync (processo_id, contact_id_freshsales);

create index if not exists processo_contato_sync_proc_idx
  on judiciario.processo_contato_sync (processo_id);

create index if not exists partes_cliente_hmadv_idx
  on judiciario.partes (cliente_hmadv)
  where cliente_hmadv is true;

create index if not exists partes_representada_escritorio_idx
  on judiciario.partes (representada_pelo_escritorio)
  where representada_pelo_escritorio is true;

create table if not exists judiciario.operacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  acao text not null,
  status text not null default 'success',
  payload jsonb not null default '{}'::jsonb,
  resumo text null,
  result_summary jsonb not null default '{}'::jsonb,
  result_sample jsonb not null default '[]'::jsonb,
  requested_count integer not null default 0,
  affected_count integer not null default 0,
  error_message text null,
  created_at timestamptz not null default now(),
  finished_at timestamptz not null default now()
);

create index if not exists idx_operacao_execucoes_modulo_created_at
  on judiciario.operacao_execucoes (modulo, created_at desc);

create index if not exists idx_operacao_execucoes_acao_created_at
  on judiciario.operacao_execucoes (acao, created_at desc);

grant usage on schema judiciario to authenticated, service_role;
grant select, insert on table judiciario.operacao_execucoes to authenticated, service_role;
grant select on table judiciario.operacao_execucoes to anon;
