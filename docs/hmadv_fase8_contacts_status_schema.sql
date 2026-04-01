begin;

alter table if exists judiciario.processos
  add column if not exists status_fonte text,
  add column if not exists status_detectado_em timestamptz,
  add column if not exists status_evento_origem text;

alter table if exists judiciario.partes
  add column if not exists representada_pelo_escritorio boolean default false,
  add column if not exists cliente_hmadv boolean default false,
  add column if not exists contato_freshsales_id text,
  add column if not exists principal_no_account boolean default false;

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
);

create unique index if not exists processo_contato_sync_unq
  on judiciario.processo_contato_sync (processo_id, contact_id_freshsales);

create index if not exists processo_contato_sync_proc_idx
  on judiciario.processo_contato_sync (processo_id);

commit;
