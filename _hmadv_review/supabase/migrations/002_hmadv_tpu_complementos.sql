begin;

create table if not exists judiciario.tpu_tipo_complemento (
  id uuid primary key default gen_random_uuid(),
  seq_tipo_complemento integer not null unique,
  descricao text not null,
  observacao text,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_complemento (
  id uuid primary key default gen_random_uuid(),
  seq_complemento integer not null unique,
  seq_tipo_complemento integer references judiciario.tpu_tipo_complemento(seq_tipo_complemento),
  descricao text not null,
  observacao text,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_complemento_movimento (
  id uuid primary key default gen_random_uuid(),
  seq_compl_mov integer not null unique,
  seq_complemento integer references judiciario.tpu_complemento(seq_complemento),
  cod_movimento integer references judiciario.tpu_movimento(codigo_cnj),
  data_inclusao timestamptz,
  usuario_inclusao text,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_complemento_tabelado (
  id uuid primary key default gen_random_uuid(),
  seq_compl_tabelado integer not null unique,
  seq_complemento integer references judiciario.tpu_complemento(seq_complemento),
  valor_tabelado text not null,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_procedimento_complemento (
  id uuid primary key default gen_random_uuid(),
  seq_procedimento_complemento integer not null unique,
  cod_movimento integer references judiciario.tpu_movimento(codigo_cnj),
  seq_tipo_complemento integer references judiciario.tpu_tipo_complemento(seq_tipo_complemento),
  valor text not null,
  data_inclusao timestamptz,
  usuario_inclusao text,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_temporariedade (
  id uuid primary key default gen_random_uuid(),
  seq_temp integer not null unique,
  temporariedade text not null,
  texto_temporariedade text not null,
  tipo_justica text not null,
  texto_tipo_justica text not null,
  ordem integer not null,
  status text not null,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_tipo_ramo_justica (
  id uuid primary key default gen_random_uuid(),
  seq_tipo_ramo_justica integer not null unique,
  descricao text,
  nome text,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists judiciario.tpu_temp_item (
  id uuid primary key default gen_random_uuid(),
  seq_temp_item integer not null unique,
  seq_item integer not null,
  seq_temp integer references judiciario.tpu_temporariedade(seq_temp),
  tipo_item text not null,
  observacao text,
  seq_tipo_ramo_justica integer references judiciario.tpu_tipo_ramo_justica(seq_tipo_ramo_justica),
  usuario_inclusao text not null,
  data_inclusao timestamptz not null,
  importado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_tpu_complemento_movimento_cod_mov
  on judiciario.tpu_complemento_movimento (cod_movimento);

create index if not exists idx_tpu_procedimento_complemento_cod_mov
  on judiciario.tpu_procedimento_complemento (cod_movimento);

create index if not exists idx_tpu_temp_item_seq_item_tipo
  on judiciario.tpu_temp_item (seq_item, tipo_item);

commit;
