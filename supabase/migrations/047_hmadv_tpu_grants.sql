grant usage on schema judiciario to service_role;

grant select, insert, update, delete on table judiciario.tpu_classe to service_role;
grant select, insert, update, delete on table judiciario.tpu_assunto to service_role;
grant select, insert, update, delete on table judiciario.tpu_movimento to service_role;
grant select, insert, update, delete on table judiciario.tpu_documento to service_role;
grant select, insert, update, delete on table judiciario.tpu_sync_log to service_role;
grant select, update on table judiciario.movimentos to service_role;
grant select on table judiciario.processos to service_role;

alter table if exists judiciario.tpu_classe disable row level security;
alter table if exists judiciario.tpu_assunto disable row level security;
alter table if exists judiciario.tpu_movimento disable row level security;
alter table if exists judiciario.tpu_documento disable row level security;
alter table if exists judiciario.tpu_sync_log disable row level security;
alter table if exists judiciario.movimentos disable row level security;
alter table if exists judiciario.processos disable row level security;

alter default privileges in schema judiciario
grant select, insert, update, delete on tables to service_role;
