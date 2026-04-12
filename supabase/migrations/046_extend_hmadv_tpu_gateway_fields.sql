alter table if exists judiciario.tpu_movimento
  add column if not exists codigo_pai_cnj integer,
  add column if not exists glossario text,
  add column if not exists monocratico boolean,
  add column if not exists colegiado boolean,
  add column if not exists presidente_vice boolean,
  add column if not exists sigiloso boolean,
  add column if not exists dispositivo_legal text,
  add column if not exists artigo text,
  add column if not exists movimento_template text,
  add column if not exists complementos_detalhados jsonb default '[]'::jsonb,
  add column if not exists gateway_payload jsonb default '{}'::jsonb,
  add column if not exists gateway_synced_at timestamptz;

alter table if exists judiciario.tpu_classe
  add column if not exists glossario text,
  add column if not exists codigo_pai_cnj integer,
  add column if not exists sigiloso boolean,
  add column if not exists dispositivo_legal text,
  add column if not exists artigo text,
  add column if not exists gateway_payload jsonb default '{}'::jsonb,
  add column if not exists gateway_synced_at timestamptz;

alter table if exists judiciario.tpu_assunto
  add column if not exists glossario text,
  add column if not exists gateway_payload jsonb default '{}'::jsonb,
  add column if not exists gateway_synced_at timestamptz;

alter table if exists judiciario.tpu_documento
  add column if not exists glossario text,
  add column if not exists gateway_payload jsonb default '{}'::jsonb,
  add column if not exists gateway_synced_at timestamptz;
