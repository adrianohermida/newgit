# HMADV Workflow Aprimorado para Freshsales

## Objetivo

Garantir que o Freshsales seja atualizado em camadas:

1. o processo entra ou e vinculado;
2. o DataJud enriquece o processo no Supabase;
3. o Sales Account recebe os campos estruturados corretos;
4. andamentos e publicacoes sao exportados como activities.

## Fluxo recomendado

### 1. Entrada e enriquecimento judicial

- `fs-webhook`
  - recebe o processo vindo do Freshsales;
  - enfileira `fs_webhook_sync`.
- `datajud-worker`
  - consulta e persiste DataJud;
  - atualiza o processo no Supabase;
  - cria a activity de consulta.

### 2. Reparacao do Sales Account

- `fs-account-repair`
  - usa os campos reais do catalogo do Freshsales;
  - preenche titulo, comarca, classe, numero do juizo, descricao do ultimo movimento, diario e conteudo da ultima publicacao;
  - reaproveita partes, movimentos e publicacoes ja existentes no Supabase.

### 3. Exportacao operacional

- `sync-worker`
  - cria e vincula accounts pendentes;
  - sincroniza dados bidirecionais basicos;
  - exporta `movimentos` como activities;
  - exporta `publicacoes` como activities.

## Cron recomendado

### Frequente

- `datajud-worker`: a cada 5 minutos
- `sync-worker`: a cada 2 minutos

### Completacao do Sales Account

Enquanto a chamada interna do `sync-worker -> fs-account-repair` nao estiver consolidada no runtime, rodar `fs-account-repair` como cron separado:

- `fs-account-repair?action=batch&limit=5&offset=0`
- repetir com offsets progressivos ou com janelas rotativas

Sugestao pratica:

- `fs-account-repair`: a cada 10 minutos, em lotes pequenos

## Prova ja validada

No processo `0000204-50.2021.8.26.0441`, o fluxo corrigido ja preencheu corretamente no Freshsales:

- `city`
- `cf_numero_do_juizo`
- `cf_classe`
- `cf_descricao_ultimo_movimento`
- `cf_DJ`
- `cf_publicacao_em`
- `cf_contedo_publicacao`

Tambem ja estava comprovado:

- `142` andamentos exportados
- `1` publicacao exportada

## Endpoint operacional

### Reparo unitario

- `fs-account-repair`

### Reparo em lote

- `fs-account-repair?action=batch&limit=N&offset=M`

## Leitura operacional

O workflow antigo atualizava o account de forma parcial e depois partia para timeline.
O workflow aprimorado insere uma etapa de completude do Sales Account antes da exportacao de andamentos e publicacoes.

Isso melhora:

- qualidade dos detalhes do processo no Freshsales;
- consistencia entre Supabase e CRM;
- rastreabilidade para o usuario final antes mesmo da timeline estar 100% drenada.

## Pendencias atualizadas em 2026-04-12

### Ja consolidado no `main`

- trilha financeira canonica `Freshsales + Supabase billing`;
- painel e API operacional HMADV com leituras de overview, filas e historico;
- worker HMADV IA e deploy Cloudflare estabilizados;
- migracao [040_create_hmadv_processo_cobertura_sync.sql](D:/Github/newgit/supabase/migrations/040_create_hmadv_processo_cobertura_sync.sql) adicionada para destravar a leitura de cobertura processual esperada pelo painel;
- lote HMADV prioritario portado para `supabase/functions`;
- migrations `041` a `054` versionadas no repositorio;
- lote HMADV prioritario deployado no projeto remoto Supabase em 2026-04-12.

### Estado operacional real em 2026-04-12

- `tpu-sync?action=status` respondeu com `ok: true`;
- `sync-worker?action=status` respondeu, mas em modo degradado por ausencia do schema `judiciario` no remoto;
- `advise-sync?action=status` respondeu, mas com `token_ok: false`;
- `npx supabase db push --dry-run` confirmou divergencia entre historico remoto e diretorio local de migrations.

### Ainda pendente no nivel operacional

- reconciliar o historico remoto de migrations antes de aplicar `040` a `054`;
- criar ou validar o schema `judiciario` no banco alvo;
- configurar `ADVISE_TOKEN` no runtime da function `advise-sync`;
- executar teste ponta a ponta com processo real controlado;
- decidir se `extractPartiesFromProcess` sera internalizado ou mantido como integracao externa opcional.

### Funcoes legadas avaliadas como superseded

- `fs-exec`
- `fs-populate`
- `fs-runner`
- `process-datajud-queue`

Essas rotas antigas foram mantidas fora do `main` porque duplicam responsabilidades hoje cobertas por `fs-webhook`, `fs-account-repair`, `processo-sync`, `publicacoes-freshsales`, `datajud-webhook` e `sync-worker`.

### Proxima ordem recomendada

1. rodar `npx supabase db pull` e revisar a trilha remota trazida do projeto;
2. decidir a reconciliacao via `migration repair` ou rebase local antes de qualquer `db push`;
3. aplicar as migrations HMADV novas no banco de destino e validar permissoes e relacoes reais;
4. configurar `ADVISE_TOKEN` no runtime remoto;
5. executar validacao integrada das funcoes `datajud-worker`, `processo-sync`, `fs-account-repair`, `sync-worker`, `publicacoes-freshsales`, `tpu-sync`, `datajud-webhook` e `advise-sync`;
6. so entao ligar a esteira completa em producao sem fallback manual.
