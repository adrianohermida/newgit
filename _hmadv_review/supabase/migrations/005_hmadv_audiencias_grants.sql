begin;

grant usage on schema judiciario to anon, authenticated, service_role;

grant select, insert, update on table judiciario.audiencias to authenticated, service_role;
grant select on table judiciario.audiencias to anon;

commit;
