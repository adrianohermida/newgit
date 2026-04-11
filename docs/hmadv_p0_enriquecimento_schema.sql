begin;

alter table if exists judiciario.processos
  add column if not exists datajud_status text,
  add column if not exists datajud_last_attempt_at timestamptz,
  add column if not exists datajud_last_success_at timestamptz,
  add column if not exists datajud_last_error text,
  add column if not exists datajud_nao_enriquecivel boolean default false,
  add column if not exists datajud_payload_hash text;

comment on column judiciario.processos.datajud_status is
  'Status do enriquecimento DataJud: pendente, processando, enriquecido, falha_temporaria, nao_enriquecivel';

alter table if exists judiciario.publicacoes
  add column if not exists processual boolean default true,
  add column if not exists tipo_documento text,
  add column if not exists motivo_sem_processo text,
  add column if not exists triagem_manual boolean default false;

comment on column judiciario.publicacoes.processual is
  'Indica se a publicacao pertence a um processo judicial monitoravel';

comment on column judiciario.publicacoes.motivo_sem_processo is
  'Motivo pelo qual a publicacao nao foi associada a processo';

create index if not exists idx_processos_datajud_status
  on judiciario.processos (datajud_status);

create index if not exists idx_processos_datajud_nao_enriquecivel
  on judiciario.processos (datajud_nao_enriquecivel);

create index if not exists idx_publicacoes_processo_triagem
  on judiciario.publicacoes (processo_id, processual, triagem_manual);

update judiciario.processos
set datajud_status = case
  when coalesce(dados_incompletos, false) = false then 'enriquecido'
  else 'pendente'
end
where datajud_status is null;

update judiciario.publicacoes
set processual = false,
    tipo_documento = coalesce(tipo_documento, 'portaria_administrativa'),
    motivo_sem_processo = coalesce(motivo_sem_processo, 'publicacao_administrativa_sem_cnj'),
    triagem_manual = true
where processo_id is null
  and numero_processo_api is null
  and (
    coalesce(despacho, '') ilike '%portaria%'
    or coalesce(conteudo, '') ilike '%portaria%'
  );

commit;
