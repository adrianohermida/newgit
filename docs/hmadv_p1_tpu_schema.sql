begin;

create table if not exists judiciario.serventia_cnj (
  id uuid primary key default gen_random_uuid(),
  tribunal text not null,
  uf text,
  municipio text,
  codigo_municipio_ibge text,
  numero_serventia text,
  nome_serventia text not null,
  tipo_orgao text,
  competencia text,
  telefone text,
  email text,
  endereco text,
  cep text,
  geolocalizacao jsonb,
  horario_funcionamento text,
  ativa boolean default true,
  origem text default 'CNJ',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_serventia_cnj_unique
  on judiciario.serventia_cnj (tribunal, coalesce(numero_serventia, ''), nome_serventia);

create table if not exists judiciario.juizo_cnj (
  id uuid primary key default gen_random_uuid(),
  tribunal text not null,
  grau text,
  orgao_julgador text not null,
  competencia text,
  codigo_cnj text,
  serventia_id uuid references judiciario.serventia_cnj(id),
  origem text default 'CNJ',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_juizo_cnj_unique
  on judiciario.juizo_cnj (tribunal, coalesce(codigo_cnj, ''), orgao_julgador);

create table if not exists judiciario.codigo_foro_tjsp (
  id uuid primary key default gen_random_uuid(),
  codigo_foro text not null unique,
  nome_foro text not null,
  comarca text,
  municipio text,
  uf text default 'SP',
  tribunal text default 'TJSP',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists judiciario.tpu_documento (
  id uuid primary key default gen_random_uuid(),
  codigo_cnj integer not null unique,
  nome text not null,
  descricao text,
  ativa boolean default true,
  versao_cnj integer,
  codigo_pai_cnj integer,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

alter table if exists judiciario.processos
  add column if not exists serventia_cnj_id uuid references judiciario.serventia_cnj(id),
  add column if not exists juizo_cnj_id uuid references judiciario.juizo_cnj(id),
  add column if not exists codigo_foro_local text,
  add column if not exists parser_tribunal_schema text,
  add column if not exists parser_grau text,
  add column if not exists parser_sistema text;

alter table if exists judiciario.movimentos
  add column if not exists tpu_status text,
  add column if not exists tpu_resolvido_em timestamptz;

create index if not exists idx_processos_serventia_cnj
  on judiciario.processos (serventia_cnj_id);

create index if not exists idx_processos_juizo_cnj
  on judiciario.processos (juizo_cnj_id);

create index if not exists idx_movimentos_tpu_status
  on judiciario.movimentos (tpu_status);

commit;
