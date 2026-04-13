# HMADV: checklist Advise -> Publicacoes -> CRM

Data da auditoria: 2026-04-13

## Resumo executivo

- O cron atual nao busca publicacoes do Advise por processo marcado com `sync` ou tag `datajud`.
- O cron atual executa um `sync` global do Advise por janela de datas e depois tenta distribuir o resultado para o modulo de `publicacoes`.
- O projeto HMADV esta recebendo publicacoes do Advise no Supabase alvo, mas isso nao prova cobertura por processo marcado.
- A tela interna `pages/interno/publicacoes.js` estava mais avancada que a rota ativa `pages/api/admin-hmadv-publicacoes.js`.
- A rota ativa foi atualizada nesta auditoria para suportar a maior parte das chamadas que a UI ja fazia.

## O que foi confirmado

### 1. Entrada do cron

- Arquivo: `supabase/functions/datajud-webhook/index.ts`
- O cron principal chama, em sequencia:
- `handleCronTaggedDatajud(...)`
- `advise-sync?action=sync`
- `publicacoes-freshsales`
- `sync-worker`

Leitura operacional:

- `handleCronTaggedDatajud` atua no universo marcado para DataJud.
- `advise-sync?action=sync` nao recebe lista de processos e nao aplica filtro por tag.
- Portanto o passo do Advise hoje e global, nao "por processo com sync/tag datajud".

### 2. Coleta do Advise

- Arquivo: `supabase/functions/advise-sync/index.ts`
- O fluxo de coleta usa cursor e intervalo de datas.
- Nao ha filtro explicito por `processNumbers`, `processo_id`, tag `datajud` ou marcador de sincronizacao por processo.

Conclusao:

- O modulo consegue receber publicacoes do Advise.
- O modulo nao garante, hoje, polling orientado a cada processo marcado com sync.

### 3. Recebimento real no projeto HMADV

Script usado:

- `scripts/hmadv-audit-supabase-target.ps1 -ProjectRef sspvizogbcyigquqycsz -Json`

Sinais observados na auditoria:

- `advise_token_ok: true`
- `advise_modo: core_fallback`
- `publicacoes_total: 3000`
- `publicacoes_pendentes_fs: 378`
- `syncworker_publicacoes: 50`
- `syncworker_em_execucao: true`

Conclusao:

- O projeto certo esta recebendo registros do Advise.
- Ainda existe fila pendente para CRM/activity.
- O ultimo ciclo auditado do Advise retornou `total_registros: 0`, o que mostra que o pipeline existe, mas o lote mais recente nao trouxe novos itens.

## Checklist funcional do modulo interno/publicacoes

### A. Observabilidade do Advise

- [x] Mostrar status do `advise-sync` no overview da tela
- [x] Exibir `token_ok`
- [x] Exibir `modo`
- [x] Exibir cursor/status da ultima execucao
- [x] Exibir volume recebido e pendencia para CRM
- [ ] Exibir erro operacional persistido quando o Advise falhar em producao
- [ ] Exibir discrepancia entre "recebidas do Advise" e "vinculadas a processo"

### B. Mesa integrada

- [x] Listar candidatos para criar processo
- [x] Listar candidatos para extrair partes
- [x] Unificar filas em uma mesa integrada
- [x] Permitir selecao em massa por filtro
- [x] Exibir validacao operacional por CNJ
- [ ] Persistir ordenacao/filtros da mesa no backend
- [ ] Exibir causa primaria da pendencia por item com classificacao mais objetiva

### C. Detalhe integrado

- [x] Carregar cobertura do processo HMADV
- [x] Carregar partes vinculadas
- [x] Carregar partes pendentes
- [x] Carregar contato vinculado quando existir
- [x] Carregar historico de validacao
- [ ] Incluir amostra das publicacoes do processo no mesmo detalhe
- [ ] Incluir status de activities Freshsales por publicacao no detalhe

### D. Acoes operacionais

- [x] `criar_processos_publicacoes`
- [x] `backfill_partes`
- [x] `sincronizar_partes`
- [x] `reconciliar_partes_contatos`
- [x] `run_sync_worker`
- [x] `create_job`
- [x] `run_pending_jobs`
- [x] `salvar_validacao`
- [ ] `job_status`
- [ ] `publicacoes_pendentes`
- [ ] `activity_types`

Observacao runtime:

- Em 2026-04-13, `getPublicationActivityTypes()` retornou erro de integracao `FS GET selector/sales_activity_types 404`.
- Na rota ativa, isso foi convertido para degradação controlada, sem derrubar o modulo inteiro.
- O worker remoto `publicacoes-freshsales` tambem foi ajustado e publicado com fallback para `Publicacao processual`, evitando erro fatal nesse endpoint.

### E. Integracao Advise -> publicacoes

- [x] Ha ingestao do Advise para o banco alvo
- [x] Ha indicio de consumo pelo `sync-worker`
- [x] Ha fila pendente de CRM/activity
- [ ] Ha polling por processo marcado com tag `datajud`
- [ ] Ha garantia de cobertura por processo marcado com sync
- [ ] Ha reconciliação explicita entre CNJ marcado e publicacoes efetivamente trazidas do Advise

## Delta entre UI e API ativa

Situacao anterior desta auditoria:

- A UI `pages/interno/publicacoes.js` estava preparada para uma operacao mais rica.
- A rota ativa `pages/api/admin-hmadv-publicacoes.js` ainda nao acompanhava esse desenho.

Atualizacoes aplicadas na auditoria:

- overview com status do Advise e `sync-worker`
- `mesa_integrada`
- `mesa_integrada_selecao`
- `detalhe_integrado`
- validacao por CNJ
- `create_job`
- `run_pending_jobs`
- `run_job_chunk`
- `sincronizar_partes`
- `criar_processos_publicacoes`
- `sincronizar_publicacoes_activity`
- `reconciliar_partes_contatos`
- `salvar_validacao`

## Lacunas estruturais prioritarias

### P0

- [ ] Definir se o Advise deve operar por polling global ou por processos marcados
- [ ] Se a regra correta for por processo marcado, alterar `advise-sync` para aceitar universo de CNJs/tag e registrar cobertura por processo
- [ ] Medir quantas `publicacoes` do Advise chegam sem conseguir casar com `processos`

### P1

- [ ] Expor endpoint ativo para `job_status`
- [ ] Expor endpoint ativo para `publicacoes_pendentes`
- [ ] Corrigir consulta real de `activity_types` no Freshsales ou assumir fallback definitivo
- [ ] Acrescentar detalhe com publicacoes recentes e status de activity por item

### P2

- [ ] Criar painel de "cobertura Advise por processo marcado"
- [ ] Registrar ultima coleta por CNJ/tag em metadata ou tabela de controle
- [ ] Diferenciar claramente na UI: ingestao Advise, vinculacao ao processo, criacao de parte, sincronizacao CRM

## Conclusao

- O modulo `interno/publicacoes` agora esta bem mais proximo do que a UI ja esperava.
- O ponto principal que continua aberto nao e de tela, e de desenho do pipeline: hoje o Advise sincroniza de forma global, e nao por processo marcado com `sync/tag datajud`.
- Em outras palavras: estamos recebendo publicacoes do Advise, mas ainda nao existe garantia tecnica de cobertura orientada a cada processo marcado.

## Atualizacao operacional apos implementacao

- O repositório local foi atualizado para:
- fazer `supabase/functions/advise-sync/index.ts` aceitar `processNumbers`
- aplicar filtro por CNJ no lote recebido do Advise quando houver escopo informado
- fazer `supabase/functions/datajud-webhook/index.ts` montar um universo de CNJs a partir das contas tagueadas com `datajud`
- usar esse universo no `cron_integracao_total`
- publicar uma action dedicada `advise_tagged_sync`

Validacao remota apos deploy:

- `advise-sync` e `datajud-webhook` foram publicados com sucesso no projeto `sspvizogbcyigquqycsz`
- `advise-sync?action=status` respondeu e mostrou nova execucao em `2026-04-13T15:32:11.431+00:00`
- `datajud-webhook?action=advise_tagged_sync` ainda retornou `401 Unauthorized`
- depois de republicar isoladamente o `advise-sync`, a resposta de `advise-sync?action=sync_range` passou a exibir os novos campos de escopo esperados:
- `execucao.scope_count = 2`
- `execucao.scoped = true`
- `fora_escopo = 10`
- `scope.processNumbers = ["00001454220218260286","00000527320208260073"]`

Leitura atual:

- a mudanca estrutural do escopo por CNJ no `advise-sync` esta implementada, publicada e validada remotamente
- o `datajud-webhook` tambem foi atualizado para montar o escopo tagged, mas sua invocacao externa ainda encontra barreira de autenticacao (`401`)
- portanto, o gap de escopo do Advise foi fechado; o ponto pendente ficou concentrado na autenticacao externa/orquestracao do `datajud-webhook`

## Estado final validado em 2026-04-13

- O `401` do `datajud-webhook` foi resolvido com ajuste de autenticacao e forwarding de headers entre functions.
- O `404` do `publicacoes-freshsales` foi resolvido com a normalizacao do dominio Freshsales para `*.myfreshworks.com`.
- `publicacoes-freshsales?action=activity_types` passou a responder com a lista real de activity types do tenant.
- `publicacoes-freshsales?action=sync&batch=1` criou activity e prazo com sucesso para a publicacao `56c908ef-27e9-459d-9f37-ca61715fa116`.
- `datajud-webhook?action=cron_integracao_total` concluiu com `advise.ok = true`, `publicacoes.sucesso = 1` e `worker.ok = true`.
- O fluxo operacional `DataJud + Advise + Publicacoes + sync-worker` esta funcional no ambiente `sspvizogbcyigquqycsz`.

## Auditoria complementar do modulo `interno/publicacoes` em 2026-04-13

### Checklist funcional do modulo interno/publicacoes

- [x] `overview`
  - API: `pages/api/admin-hmadv-publicacoes.js`
  - Runtime: `functions/lib/hmadv-ops.js#getPublicacoesOverview`
  - Validado com contadores consistentes de total, com activity, pendentes com account, leilao ignorado e sem processo.
- [x] `candidatos_processos`
  - API exposta e consumida pela UI.
  - Estado atual: sem candidatos relevantes no lote auditado.
- [x] `candidatos_partes`
  - API exposta e consumida pela UI.
  - Achado: havia falso positivo por nomes com prefixo de pontuacao; a limpeza foi corrigida na extracao admin.
- [x] `historico`
  - API exposta e usada para leitura operacional do modulo.
- [x] `jobs`
  - API exposta e integrada com polling da UI.
- [x] `job_status`
  - Endpoint existe na API ativa e no runtime.
- [x] `mesa_integrada`
  - Endpoint existe na API ativa e no runtime.
- [x] `mesa_integrada_selecao`
  - Endpoint existe na API ativa e no runtime.
- [x] `detalhe_integrado`
  - Endpoint existe na API ativa e no runtime.
  - Carrega cobertura, partes vinculadas, partes pendentes e validacao por CNJ.
- [x] `publicacoes_pendentes`
  - Endpoint existe na API ativa e no runtime.
  - Validado em runtime com `98` linhas no recorte consultado.
- [x] `activity_types`
  - Endpoint existe na API ativa e no runtime.
  - Validado com lista real de activity types do tenant Freshsales.
- [x] `create_job`
  - API exposta e integrada na UI.
- [x] `run_pending_jobs`
  - API exposta e integrada na UI com polling/drain loop.
- [x] `run_job_chunk`
  - API exposta.
- [x] `backfill_partes`
  - API exposta.
- [x] `sincronizar_partes`
  - API exposta e runtime existente.
- [x] `criar_processos_publicacoes`
  - API exposta e runtime existente.
- [x] `sincronizar_publicacoes_activity`
  - API exposta e runtime existente.
  - Fluxo validado indiretamente pelo `publicacoes-freshsales` e pela queda do backlog.
- [x] `reconciliar_partes_contatos`
  - API exposta e runtime existente.
- [x] `salvar_validacao`
  - API exposta e persistencia habilitada por CNJ.

### Checklist de integracao Advise + DataJud + Freshsales + Supabase

- [x] O cron/orquestracao do `datajud-webhook` consegue acionar o fluxo tagged por processos com tag `datajud`.
- [x] O `advise-sync` aceita escopo por `processNumbers` e filtra publicacoes fora do universo informado.
- [x] As publicacoes do Advise estao chegando ao banco HMADV.
- [x] O modulo/runtimes enxergam backlog real de publicacoes pendentes de CRM.
- [x] O `publicacoes-freshsales` cria activities e prazos no Freshsales com sucesso.
- [x] O tenant retorna activity types reais, sem fallback quebrado.
- [x] O `sync-worker` e o `cron_integracao_total` seguem operacionais apos os ajustes de auth/header forwarding.
- [ ] Ainda existem pendencias residuais de qualidade na extracao de partes a partir do texto da publicacao.
  - Exemplo atual: nome com prefixo numerico (`"8 I EMPREENDIMENTOS SPE 1 LTDA"`), indicando necessidade de saneamento adicional na heuristica.

### Estado operacional apos nova drenagem

- Antes da rodada desta secao: `publicacoesComActivity = 2897` e `publicacoesPendentesComAccount = 101`.
- A execucao real `node scripts/hmadv-drain-publicacoes-freshsales.js --batch=30 --iterations=1` processou `30/30` com sucesso.
- Depois da rodada: `publicacoesComActivity = 2927` e `publicacoesPendentesComAccount = 71`.
- Lote seguro observado para operacao manual/assistida: `batch=30`.
- `batch=50` ja havia falhado anteriormente com limite de compute do Worker, entao nao deve ser usado como padrao operacional.

### Estado operacional final validado no fechamento

- Rodada adicional de `batch=30` reduziu o saldo para `publicacoesComActivity = 2959` e `publicacoesPendentesComAccount = 39`.
- Uma rodada subsequente ainda em `batch=30`, apesar de timeout local no terminal, foi confirmada por validacao runtime e reduziu o saldo para `publicacoesComActivity = 2987` e `publicacoesPendentesComAccount = 11`.
- A rodada final `node scripts/hmadv-drain-publicacoes-freshsales.js --batch=15 --iterations=1` processou `9/9` com sucesso.
- Estado final:
  - `publicacoesTotal = 3000`
  - `publicacoesComActivity = 2998`
  - `publicacoesPendentesComAccount = 0`
  - `publicacoesLeilaoIgnorado = 227`
  - `publicacoesSemProcesso = 2`
- Conclusao operacional: a fila de publicacoes pendentes com account no Freshsales foi zerada.

### Script operacional adicionado

- Arquivo: `scripts/hmadv-drain-publicacoes-freshsales.js`
- Atalho npm: `npm run drain:hmadv-publicacoes -- --batch=30 --iterations=1`
- Objetivo: drenar a fila de `publicacoes-freshsales` com carregamento automatico de `.dev.vars`, sem depender de variaveis previamente exportadas no shell.
