create table if not exists judiciario.processo_evento_regra (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  categoria text not null,
  termo text not null,
  valor_resultado text not null,
  prioridade integer not null default 100,
  ativo boolean not null default true,
  origem text not null default 'hmadv_seed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists processo_evento_regra_unq
  on judiciario.processo_evento_regra (tipo, categoria, termo, valor_resultado);

create index if not exists processo_evento_regra_tipo_categoria_idx
  on judiciario.processo_evento_regra (tipo, categoria, prioridade)
  where ativo is true;

insert into judiciario.processo_evento_regra (tipo, categoria, termo, valor_resultado, prioridade, metadata)
values
  ('status', 'movimento', 'baixado', 'Baixado', 10, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'baixa definitiva', 'Baixado', 10, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'arquivado', 'Baixado', 10, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'arquivamento definitivo', 'Baixado', 10, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'cancelado', 'Baixado', 20, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'extinto', 'Baixado', 20, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'extincao do processo', 'Baixado', 20, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'transitado em julgado e arquivado', 'Baixado', 5, '{"forca":"forte"}'::jsonb),
  ('status', 'publicacao', 'baixado', 'Baixado', 20, '{"forca":"media"}'::jsonb),
  ('status', 'publicacao', 'arquivado', 'Baixado', 20, '{"forca":"media"}'::jsonb),
  ('status', 'publicacao', 'arquivamento definitivo', 'Baixado', 15, '{"forca":"media"}'::jsonb),
  ('status', 'publicacao', 'cancelado', 'Baixado', 25, '{"forca":"media"}'::jsonb),
  ('status', 'publicacao', 'extinto', 'Baixado', 25, '{"forca":"media"}'::jsonb),
  ('status', 'movimento', 'suspenso', 'Suspenso', 10, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'suspensao', 'Suspenso', 10, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'sobrestado', 'Suspenso', 10, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'sobrestamento', 'Suspenso', 10, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'suspensao do processo', 'Suspenso', 5, '{"forca":"forte"}'::jsonb),
  ('status', 'movimento', 'suspensao do prazo', 'Suspenso', 20, '{"forca":"media"}'::jsonb),
  ('status', 'publicacao', 'suspenso', 'Suspenso', 20, '{"forca":"media"}'::jsonb),
  ('status', 'publicacao', 'suspensao', 'Suspenso', 20, '{"forca":"media"}'::jsonb),
  ('status', 'publicacao', 'sobrestado', 'Suspenso', 20, '{"forca":"media"}'::jsonb),
  ('status', 'publicacao', 'sobrestamento', 'Suspenso', 20, '{"forca":"media"}'::jsonb),
  ('polo', 'ativo', 'autor', 'ativo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'ativo', 'requerente', 'ativo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'ativo', 'exequente', 'ativo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'ativo', 'agravante', 'ativo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'ativo', 'impetrante', 'ativo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'ativo', 'recorrente', 'ativo', 20, '{"forca":"media"}'::jsonb),
  ('polo', 'ativo', 'embargante', 'ativo', 20, '{"forca":"media"}'::jsonb),
  ('polo', 'passivo', 'reu', 'passivo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'passivo', 'requerido', 'passivo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'passivo', 'executado', 'passivo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'passivo', 'agravado', 'passivo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'passivo', 'impetrado', 'passivo', 10, '{"forca":"forte"}'::jsonb),
  ('polo', 'passivo', 'recorrido', 'passivo', 20, '{"forca":"media"}'::jsonb),
  ('polo', 'passivo', 'embargado', 'passivo', 20, '{"forca":"media"}'::jsonb)
on conflict do nothing;
