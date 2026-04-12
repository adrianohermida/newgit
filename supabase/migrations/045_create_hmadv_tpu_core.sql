create table if not exists judiciario.tpu_assunto (
  id uuid primary key default gen_random_uuid(),
  codigo_cnj integer not null unique,
  nome text not null,
  descricao text null,
  area_direito text null,
  dispositivo_legal text null,
  artigo text null,
  sigiloso boolean default false,
  assunto_secundario boolean default false,
  crime_antecedente boolean default false,
  just_estadual boolean default false,
  just_federal boolean default false,
  just_trabalho boolean default false,
  stf boolean default false,
  stj boolean default false,
  codigo_pai_cnj integer null,
  hierarquia_pai_id uuid null references judiciario.tpu_assunto(id),
  caminho_hierarquico text null,
  ativa boolean default true,
  versao_cnj integer null,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_classe (
  id uuid primary key default gen_random_uuid(),
  codigo_cnj integer not null unique,
  nome text not null,
  sigla text null,
  descricao text null,
  natureza text null,
  polo_ativo text null,
  polo_passivo text null,
  area_direito text null,
  numeracao_propria boolean default false,
  just_estadual boolean default false,
  just_federal boolean default false,
  just_trabalho boolean default false,
  just_militar boolean default false,
  just_eleitoral boolean default false,
  stf boolean default false,
  stj boolean default false,
  ativa boolean default true,
  versao_cnj integer null,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_movimento (
  id uuid primary key default gen_random_uuid(),
  codigo_cnj integer not null unique,
  nome text not null,
  descricao text null,
  tipo text default 'outro',
  gera_prazo boolean default false,
  prazo_sugerido_dias integer null,
  visibilidade_externa boolean default true,
  flg_eletronico boolean default false,
  just_estadual boolean default false,
  just_federal boolean default false,
  just_trabalho boolean default false,
  stf boolean default false,
  stj boolean default false,
  ativa boolean default true,
  versao_cnj integer null,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  constraint tpu_movimento_tipo_check check (
    tipo in ('despacho', 'decisao', 'sentenca', 'acórdão', 'intimacao', 'citacao', 'outro')
  )
);

create table if not exists judiciario.tpu_documento (
  id uuid primary key default gen_random_uuid(),
  codigo_cnj integer not null unique,
  nome text not null,
  descricao text null,
  ativa boolean default true,
  versao_cnj integer null,
  codigo_pai_cnj integer null,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_sync_log (
  id uuid primary key default gen_random_uuid(),
  fonte text not null,
  tipo_tpu text not null,
  versao_cnj integer null,
  total_registros integer default 0,
  inseridos integer default 0,
  atualizados integer default 0,
  erros integer default 0,
  status text default 'pendente',
  erro text null,
  iniciado_em timestamptz default now(),
  concluido_em timestamptz null
);
