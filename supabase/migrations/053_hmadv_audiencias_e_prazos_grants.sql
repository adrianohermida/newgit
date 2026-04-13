grant usage on schema judiciario to anon, authenticated, service_role;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'audiencias',
    'processo_contato_sync',
    'processo_evento_regra',
    'prazo_regra',
    'prazo_regra_alias',
    'estado_ibge',
    'municipio_ibge',
    'feriado_forense',
    'calendario_forense_fonte',
    'suspensao_expediente',
    'prazo_calculado',
    'prazo_evento'
  ]
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'judiciario'
        and information_schema.tables.table_name = target_table
    ) then
      execute format(
        'grant select on table judiciario.%I to anon, authenticated, service_role',
        target_table
      );
      execute format(
        'grant insert, update on table judiciario.%I to authenticated, service_role',
        target_table
      );
    end if;
  end loop;
end
$$;
