begin;

create schema if not exists judiciario;

create table if not exists judiciario.publicacoes_fila_snapshot (
  id uuid primary key default gen_random_uuid(),
  queue_type text not null,
  numero_cnj text not null,
  cursor_key text not null,
  processo_id uuid null,
  titulo text null,
  account_id_freshsales text null,
  status_atual_processo text null,
  source text null,
  publicacoes_count integer not null default 0,
  partes_detectadas integer not null default 0,
  partes_novas integer not null default 0,
  partes_existentes integer not null default 0,
  last_publicacao_at timestamptz null,
  priority_score integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (queue_type, numero_cnj)
);

create index if not exists idx_publicacoes_fila_snapshot_queue_cursor
  on judiciario.publicacoes_fila_snapshot (queue_type, priority_score desc, last_publicacao_at desc, cursor_key desc);

create index if not exists idx_publicacoes_fila_snapshot_queue_updated
  on judiciario.publicacoes_fila_snapshot (queue_type, updated_at desc);

grant usage on schema judiciario to authenticated, service_role;
grant select, insert, update, delete on table judiciario.publicacoes_fila_snapshot to authenticated, service_role;
grant select on table judiciario.publicacoes_fila_snapshot to anon;

commit;
