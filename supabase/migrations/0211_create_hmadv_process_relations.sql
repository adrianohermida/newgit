create schema if not exists judiciario;

create extension if not exists pgcrypto;

create table if not exists judiciario.processo_relacoes (
  id uuid primary key default gen_random_uuid(),
  processo_pai_id uuid null,
  processo_filho_id uuid null,
  numero_cnj_pai text not null,
  numero_cnj_filho text not null,
  tipo_relacao text not null,
  status text not null default 'ativo',
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint processo_relacoes_tipo_check check (tipo_relacao in ('apenso', 'incidente', 'recurso', 'dependencia')),
  constraint processo_relacoes_status_check check (status in ('ativo', 'inativo')),
  constraint processo_relacoes_distintos check (numero_cnj_pai <> numero_cnj_filho)
);

create unique index if not exists processo_relacoes_unique_link
  on judiciario.processo_relacoes (numero_cnj_pai, numero_cnj_filho, tipo_relacao);

create index if not exists processo_relacoes_pai_idx
  on judiciario.processo_relacoes (numero_cnj_pai);

create index if not exists processo_relacoes_filho_idx
  on judiciario.processo_relacoes (numero_cnj_filho);

create index if not exists processo_relacoes_status_idx
  on judiciario.processo_relacoes (status);

create or replace function judiciario.set_updated_at_processo_relacoes()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_processo_relacoes_updated_at on judiciario.processo_relacoes;

create trigger trg_processo_relacoes_updated_at
before update on judiciario.processo_relacoes
for each row
execute function judiciario.set_updated_at_processo_relacoes();

notify pgrst, 'reload schema';
