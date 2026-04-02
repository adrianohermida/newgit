begin;

grant usage on schema judiciario to anon, authenticated, service_role;

grant select, insert, update on table judiciario.processo_contato_sync to authenticated, service_role;
grant select on table judiciario.processo_contato_sync to anon;

grant select on table judiciario.processo_evento_regra to anon, authenticated, service_role;
grant insert, update on table judiciario.processo_evento_regra to authenticated, service_role;

grant select on table judiciario.prazo_regra to anon, authenticated, service_role;
grant insert, update on table judiciario.prazo_regra to authenticated, service_role;

grant select on table judiciario.prazo_regra_alias to anon, authenticated, service_role;
grant insert, update on table judiciario.prazo_regra_alias to authenticated, service_role;

grant select on table judiciario.estado_ibge to anon, authenticated, service_role;
grant insert, update on table judiciario.estado_ibge to authenticated, service_role;

grant select on table judiciario.municipio_ibge to anon, authenticated, service_role;
grant insert, update on table judiciario.municipio_ibge to authenticated, service_role;

grant select on table judiciario.feriado_forense to anon, authenticated, service_role;
grant insert, update on table judiciario.feriado_forense to authenticated, service_role;

grant select on table judiciario.calendario_forense_fonte to anon, authenticated, service_role;
grant insert, update on table judiciario.calendario_forense_fonte to authenticated, service_role;

grant select on table judiciario.suspensao_expediente to anon, authenticated, service_role;
grant insert, update on table judiciario.suspensao_expediente to authenticated, service_role;

grant select on table judiciario.prazo_calculado to anon, authenticated, service_role;
grant insert, update on table judiciario.prazo_calculado to authenticated, service_role;

grant select on table judiciario.prazo_evento to anon, authenticated, service_role;
grant insert, update on table judiciario.prazo_evento to authenticated, service_role;

commit;
