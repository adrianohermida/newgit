begin;

create table if not exists judiciario.prazo_regra (
  id uuid primary key default gen_random_uuid(),
  ato_praticado text not null,
  base_legal text null,
  artigo text null,
  prazo_texto_original text null,
  prazo_dias integer null,
  tipo_contagem text not null default 'dias_uteis',
  ramo text null,
  rito text null,
  instancia text null,
  tribunal_sigla text null,
  aplica_ia boolean not null default false,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prazo_regra_ativo_idx
  on judiciario.prazo_regra (ativo);

create index if not exists prazo_regra_ramo_rito_idx
  on judiciario.prazo_regra (ramo, rito, instancia, tribunal_sigla);

create table if not exists judiciario.prazo_regra_alias (
  id uuid primary key default gen_random_uuid(),
  prazo_regra_id uuid not null references judiciario.prazo_regra(id) on delete cascade,
  alias text not null,
  peso integer not null default 100,
  origem text not null default 'hmadv_seed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists prazo_regra_alias_regra_idx
  on judiciario.prazo_regra_alias (prazo_regra_id);

create index if not exists prazo_regra_alias_text_idx
  on judiciario.prazo_regra_alias (alias);

create table if not exists judiciario.estado_ibge (
  id uuid primary key default gen_random_uuid(),
  codigo_ibge text not null unique,
  uf text not null unique,
  nome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists judiciario.municipio_ibge (
  id uuid primary key default gen_random_uuid(),
  codigo_ibge text not null unique,
  estado_uf text not null,
  nome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists municipio_ibge_estado_idx
  on judiciario.municipio_ibge (estado_uf);

create table if not exists judiciario.feriado_forense (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null,
  data_feriado date not null,
  estado_uf text null,
  municipio_codigo_ibge text null,
  tribunal_sigla text null,
  recorrente boolean not null default false,
  afeta_prazo boolean not null default true,
  origem text not null default 'importacao',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists feriado_forense_data_idx
  on judiciario.feriado_forense (data_feriado);

create index if not exists feriado_forense_local_idx
  on judiciario.feriado_forense (estado_uf, municipio_codigo_ibge, tribunal_sigla);

create table if not exists judiciario.calendario_forense_fonte (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tribunal_sigla text null,
  estado_uf text null,
  municipio_codigo_ibge text null,
  tipo text not null,
  url_fonte text null,
  vigencia_inicio date null,
  vigencia_fim date null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists judiciario.suspensao_expediente (
  id uuid primary key default gen_random_uuid(),
  calendario_fonte_id uuid null references judiciario.calendario_forense_fonte(id) on delete set null,
  tribunal_sigla text null,
  estado_uf text null,
  municipio_codigo_ibge text null,
  tipo text not null,
  inicio date not null,
  fim date not null,
  afeta_prazo boolean not null default true,
  descricao text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists suspensao_expediente_periodo_idx
  on judiciario.suspensao_expediente (inicio, fim);

create table if not exists judiciario.prazo_calculado (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references judiciario.processos(id) on delete cascade,
  publicacao_id uuid null references judiciario.publicacoes(id) on delete set null,
  movimento_id uuid null references judiciario.movimentos(id) on delete set null,
  audiencia_id uuid null,
  prazo_regra_id uuid null references judiciario.prazo_regra(id) on delete set null,
  evento_tipo text not null,
  titulo text not null,
  data_base date not null,
  data_inicio_contagem date not null,
  data_vencimento date not null,
  status text not null default 'aberto',
  prioridade text null,
  observacoes_ia text null,
  freshsales_task_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prazo_calculado_evento_unq
  on judiciario.prazo_calculado (processo_id, evento_tipo, coalesce(publicacao_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(movimento_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(audiencia_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists prazo_calculado_proc_status_idx
  on judiciario.prazo_calculado (processo_id, status, data_vencimento);

create table if not exists judiciario.prazo_evento (
  id uuid primary key default gen_random_uuid(),
  prazo_calculado_id uuid not null references judiciario.prazo_calculado(id) on delete cascade,
  tipo_evento text not null,
  descricao text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists prazo_evento_prazo_idx
  on judiciario.prazo_evento (prazo_calculado_id, created_at desc);

commit;
