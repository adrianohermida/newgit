alter table if exists judiciario.advise_sync_status
  add column if not exists fonte text null,
  add column if not exists status text not null default 'idle',
  add column if not exists pagina_atual integer not null default 1,
  add column if not exists ultima_pagina integer not null default 1,
  add column if not exists total_paginas integer null,
  add column if not exists total_registros integer not null default 0,
  add column if not exists registros_importados integer not null default 0;

update judiciario.advise_sync_status
set
  fonte = coalesce(fonte, 'ADVISE'),
  status = coalesce(status, 'idle'),
  pagina_atual = coalesce(pagina_atual, 1),
  ultima_pagina = coalesce(ultima_pagina, 1),
  total_registros = coalesce(total_registros, 0),
  registros_importados = coalesce(registros_importados, 0)
where true;
