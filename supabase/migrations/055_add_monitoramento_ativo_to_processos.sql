begin;

alter table if exists judiciario.processos
  add column if not exists monitoramento_ativo boolean not null default false;

create index if not exists processos_monitoramento_ativo_idx
  on judiciario.processos (monitoramento_ativo);

grant usage on schema judiciario to authenticated, service_role;
grant select, update on table judiciario.processos to authenticated, service_role;

commit;
