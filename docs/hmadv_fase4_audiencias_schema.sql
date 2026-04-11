begin;

create table if not exists judiciario.audiencias (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references judiciario.processos(id),
  origem text not null,
  origem_id uuid,
  tipo text,
  data_audiencia timestamptz,
  descricao text,
  local text,
  situacao text default 'detectada',
  metadata jsonb default '{}'::jsonb,
  freshsales_activity_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_audiencias_origem_unica
  on judiciario.audiencias (processo_id, origem, origem_id);

create index if not exists idx_audiencias_data
  on judiciario.audiencias (data_audiencia);

create index if not exists idx_audiencias_fs
  on judiciario.audiencias (freshsales_activity_id);

comment on table judiciario.audiencias is
  'Eventos de audiencia detectados a partir de movimentos DataJud e/ou publicacoes Advise.';

comment on column judiciario.audiencias.origem is
  'Fonte que originou a deteccao: movimento_datajud, publicacao_advise ou reconciliacao_manual.';

comment on column judiciario.audiencias.situacao is
  'Estado operacional da audiencia: detectada, exportada_fs, cancelada, reagendada ou ignorada.';

commit;
