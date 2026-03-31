-- HMADV - Grants minimos para carga anual da TPU via PostgREST/service_role

grant usage on schema judiciario to service_role;

grant select, insert, update, delete on table judiciario.tpu_classe to service_role;
grant select, insert, update, delete on table judiciario.tpu_assunto to service_role;
grant select, insert, update, delete on table judiciario.tpu_movimento to service_role;
grant select, insert, update, delete on table judiciario.tpu_documento to service_role;
grant select, insert, update, delete on table judiciario.tpu_tipo_complemento to service_role;
grant select, insert, update, delete on table judiciario.tpu_complemento to service_role;
grant select, insert, update, delete on table judiciario.tpu_complemento_movimento to service_role;
grant select, insert, update, delete on table judiciario.tpu_complemento_tabelado to service_role;
grant select, insert, update, delete on table judiciario.tpu_procedimento_complemento to service_role;
grant select, insert, update, delete on table judiciario.tpu_temporariedade to service_role;
grant select, insert, update, delete on table judiciario.tpu_tipo_ramo_justica to service_role;
grant select, insert, update, delete on table judiciario.tpu_temp_item to service_role;
grant select, insert, update, delete on table judiciario.tpu_sync_log to service_role;
grant select, update on table judiciario.movimentos to service_role;
grant select on table judiciario.processos to service_role;

alter table if exists judiciario.tpu_classe disable row level security;
alter table if exists judiciario.tpu_assunto disable row level security;
alter table if exists judiciario.tpu_movimento disable row level security;
alter table if exists judiciario.tpu_documento disable row level security;
alter table if exists judiciario.tpu_tipo_complemento disable row level security;
alter table if exists judiciario.tpu_complemento disable row level security;
alter table if exists judiciario.tpu_complemento_movimento disable row level security;
alter table if exists judiciario.tpu_complemento_tabelado disable row level security;
alter table if exists judiciario.tpu_procedimento_complemento disable row level security;
alter table if exists judiciario.tpu_temporariedade disable row level security;
alter table if exists judiciario.tpu_tipo_ramo_justica disable row level security;
alter table if exists judiciario.tpu_temp_item disable row level security;
alter table if exists judiciario.tpu_sync_log disable row level security;
alter table if exists judiciario.movimentos disable row level security;
alter table if exists judiciario.processos disable row level security;

alter default privileges in schema judiciario grant select, insert, update, delete on tables to service_role;
