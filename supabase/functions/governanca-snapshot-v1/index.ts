import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: schemas } = await supabase.rpc("sql", {
    query: `
      select schema_name
      from information_schema.schemata
      where schema_name not in ('pg_catalog','information_schema');
    `
  });

  const { data: tables } = await supabase.rpc("sql", {
    query: `
      select table_schema, table_name
      from information_schema.tables
      where table_schema not in ('pg_catalog','information_schema');
    `
  });

  const { data: rls } = await supabase.rpc("sql", {
    query: `
      select schemaname, tablename, rowsecurity
      from pg_tables;
    `
  });

  return new Response(
    JSON.stringify({
      snapshot_at: new Date().toISOString(),
      schemas,
      tables,
      rls
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
