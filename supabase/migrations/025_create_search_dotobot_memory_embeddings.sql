create or replace function public.search_dotobot_memory_embeddings(
  query_embedding jsonb,
  match_count integer default 5,
  match_threshold double precision default null
)
returns table (
  id uuid,
  source_key text,
  session_id text,
  route text,
  role text,
  query text,
  response_text text,
  status text,
  steps_count integer,
  embedding_model text,
  embedding_dimensions integer,
  metadata jsonb,
  similarity double precision,
  created_at timestamptz
)
language sql
stable
as $$
  select
    m.id,
    m.source_key,
    m.session_id,
    m.route,
    m.role,
    m.query,
    m.response_text,
    m.status,
    m.steps_count,
    m.embedding_model,
    m.embedding_dimensions,
    m.metadata,
    1 - (m.embedding <=> (query_embedding::text)::vector(768)) as similarity,
    m.created_at
  from public.dotobot_memory_embeddings as m
  where match_threshold is null or 1 - (m.embedding <=> (query_embedding::text)::vector(768)) >= match_threshold
  order by m.embedding <=> (query_embedding::text)::vector(768)
  limit greatest(match_count, 1);
$$;
