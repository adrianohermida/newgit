create table if not exists judiciario.monitoramento_queue (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid null,
  fonte text not null default 'manual',
  tipo text not null,
  status text not null default 'pendente',
  prioridade integer not null default 5,
  proxima_execucao timestamptz not null default now(),
  account_id_freshsales text null,
  payload jsonb not null default '{}'::jsonb,
  executado_em timestamptz null,
  tentativas integer not null default 0,
  ultimo_erro text null,
  resultado_sync jsonb null,
  criado_em timestamptz not null default now()
);

create index if not exists monitoramento_queue_status_tipo_idx
  on judiciario.monitoramento_queue (status, tipo, prioridade, proxima_execucao);

create index if not exists monitoramento_queue_account_idx
  on judiciario.monitoramento_queue (account_id_freshsales, status);

create index if not exists monitoramento_queue_processo_idx
  on judiciario.monitoramento_queue (processo_id, status);
