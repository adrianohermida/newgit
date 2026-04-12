grant usage on schema judiciario to service_role;

grant select, insert, update, delete on table judiciario.tpu_tipo_complemento to service_role;
grant select, insert, update, delete on table judiciario.tpu_complemento to service_role;
grant select, insert, update, delete on table judiciario.tpu_complemento_movimento to service_role;
grant select, insert, update, delete on table judiciario.tpu_complemento_tabelado to service_role;
grant select, insert, update, delete on table judiciario.tpu_procedimento_complemento to service_role;
grant select, insert, update, delete on table judiciario.tpu_temporariedade to service_role;
grant select, insert, update, delete on table judiciario.tpu_tipo_ramo_justica to service_role;
grant select, insert, update, delete on table judiciario.tpu_temp_item to service_role;

alter table if exists judiciario.tpu_tipo_complemento disable row level security;
alter table if exists judiciario.tpu_complemento disable row level security;
alter table if exists judiciario.tpu_complemento_movimento disable row level security;
alter table if exists judiciario.tpu_complemento_tabelado disable row level security;
alter table if exists judiciario.tpu_procedimento_complemento disable row level security;
alter table if exists judiciario.tpu_temporariedade disable row level security;
alter table if exists judiciario.tpu_tipo_ramo_justica disable row level security;
alter table if exists judiciario.tpu_temp_item disable row level security;
