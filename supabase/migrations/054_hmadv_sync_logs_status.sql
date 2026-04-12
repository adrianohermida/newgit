create table if not exists judiciario.advise_sync_log (
  id bigserial primary key,
  executado_em timestamptz not null default now(),
  data_inicio date null,
  data_fim date null,
  total_advise integer default 0,
  excluidas_leilao integer default 0,
  novas integer default 0,
  duplicadas integer default 0,
  erros integer default 0,
  vinculadas integer default 0,
  processos_criados integer default 0,
  observacao text null
);

create table if not exists judiciario.datajud_sync_status (
  id uuid primary key default gen_random_uuid(),
  numero_processo text not null unique,
  tribunal text null,
  ultima_execucao timestamptz null,
  ultimo_search_after jsonb null,
  status text null,
  erro text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
