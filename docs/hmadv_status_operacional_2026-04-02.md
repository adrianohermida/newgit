# HMADV - Status Operacional em 2026-04-02

## Resumo executivo

O nucleo `DataJud + Advise + Freshsales + TPU` ja esta operacional, mas o projeto ainda nao pode ser considerado concluido.

Os maiores gaps hoje estao em:

- cobertura de enriquecimento DataJud em `judiciario.processos`
- cobertura de `Sales Accounts` ainda sem vinculo no Freshsales
- canonizacao completa de `status_atual_processo`
- criacao e vinculacao de `Contacts`
- ausencia de audiencias reais em `judiciario.audiencias`
- motor de prazos ainda sem `prazo_calculado` e `prazo_evento`
- worker IA ainda sem homologacao operacional fim a fim

## Numeros medidos no HMADV

- `processos_total = 2728`
- `processos_com_account = 1347`
- `processos_sem_account = 1381`
- `processos_datajud_enriquecido = 282`
- `processos_datajud_processando = 0`
- `processos_datajud_falha = 0`
- `processos_sem_assunto = 2460`
- `processos_sem_classe = 2459`
- `processos_sem_area = 2727`
- `processos_sem_valor_causa = 2728`
- `processos_sem_data_ajuizamento = 2459`
- `processos_sem_sistema = 2726`
- `processos_sem_status = 2614`
- `audiencias_total = 0`
- `partes_total = 5284`
- `partes_cliente_hmadv = 0`
- `partes_contato = 0`
- `processo_contato_sync = 0`
- `freshsales_contacts = 0`
- `prazo_calculado = 0`
- `prazo_evento = 0`

## O que ja esta garantido

### Tag `Datajud`

Quando a tag `Datajud` ou `datajud` e adicionada a um `Sales Account`, o [fs-webhook](/D:/Github/newgit/_hmadv_review/supabase/functions/fs-webhook/index.ts):

- aceita a tag de forma case-insensitive
- enfileira um job em `judiciario.monitoramento_queue`
- registra a activity `Consulta` de solicitacao

Isso garante o processamento do account disparado pelo webhook.

Nao garante, sozinho, que todos os processos do Supabase sejam sincronizados automaticamente. Hoje ainda existem `1381` processos sem `account_id_freshsales`.

### TPU

O [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts) esta operando com suporte ao Gateway TPU detalhado e o backlog atual de movimentos foi zerado:

- `movimentos_pendentes = 0`
- `movimentos_resolvidos = 250`

### Publicacoes

As publicacoes nao-leilao ja estao homologadas:

- filtro negativo usando apenas `raw_payload.palavrasChave`
- bloqueio apenas para `LEILAO` e `LEILOES`
- activity no Freshsales com:
  - inicio = disponibilizacao
  - termino = publicacao

## O que ainda nao esta garantido

### Enriquecimento completo DataJud

Nao. Hoje apenas `282` dos `2728` processos aparecem como `datajud_enriquecido`.

Isso explica por que ainda ha muitos campos em branco em `judiciario.processos` e, por consequencia, no Freshsales:

- assunto
- area
- classe
- valor da causa
- data de distribuicao
- sistema
- segredo de justica

### Espelhamento completo no Freshsales

Nao. O numero mais direto hoje e:

- `processos_com_account = 1347`
- `processos_sem_account = 1381`

Enquanto `processos_sem_account` for alto, ainda nao ha espelhamento completo do Supabase para o Freshsales.

### Status processual completo

Parcial.

Ja existe prova real de canonizacao por evento em:

- `Baixado`
- `Suspenso`
- `Ativo` por fallback

Mas a cobertura ainda esta longe do ideal, porque `2614` processos ainda estao sem `status_atual_processo`.

### Arquivamento / baixa / cancelamento / suspensao

Parcial.

O projeto ja consegue detectar casos reais por `publicacoes` e `movimentos`, mas o backfill de status por evento ainda nao foi concluido em toda a base.

Regra alvo:

- `Baixado`: baixa, arquivamento, cancelamento, extincao com encerramento
- `Suspenso`: suspensao, sobrestamento
- `Ativo`: ausencia de sinal forte de baixa ou suspensao

### Extracao total de partes das publicacoes

Ainda nao.

Ja existe extracao e canonizacao parcial de polos, mas nao ha evidencia suficiente para afirmar que todas as partes historicas foram extraidas de todas as publicacoes.

### Protecao contra partes duplicadas

Ainda nao esta homologada de ponta a ponta como criterio fechado do projeto.

Hoje o rollout esta focado em:

- canonizar `polo_ativo` e `polo_passivo`
- identificar o cliente representado
- bloquear vinculacoes fracas ao CRM

Mas a auditoria formal de duplicidade de `partes` ainda precisa entrar no plano de validacao.

### Tasks automaticas de prazo, audiencia e comunicacao

Ainda nao em producao como frente fechada.

O worker IA ja tem capacidade de criar `tasks` no Freshsales, mas hoje:

- `prazo_calculado = 0`
- `prazo_evento = 0`
- `audiencias_total = 0`

Entao a automacao de `Tasks` ainda nao esta comprovada operacionalmente.

### Appointments de audiencia

O [sync-worker](/D:/Github/newgit/_hmadv_review/supabase/functions/sync-worker/index.ts) ja contem a trilha de criacao de `Appointment`, mas ainda nao existe linha real em `judiciario.audiencias` para homologar.

### Relacionamento de audiencia com cliente e usuario interno

Ainda nao homologado.

Hoje o codigo ja sabe:

- criar `sales_activity` de audiencia
- tentar criar `Appointment`
- usar owner interno padrao do Freshsales

Mas ainda nao existe prova real de:

- vinculo do cliente representado como `Contact`
- criacao do `Appointment` com relacionamento correto entre processo, owner interno e cliente

## Campo `Fase` no modulo Accounts

A lista atual mistura `fase` com `status`.

Lista atual:

- Distribuicao
- Saneamento
- Conhecimento
- Instrucao
- Audiencia
- Pericia
- Concluso para decisao
- Julgado
- Cumprimento de Sentenca
- Arquivado Definitivamente
- Arquivamento Provisorio
- Cancelado

### Recomendacao

Manter em `Fase` apenas etapas de rito/processamento:

- Distribuicao
- Conhecimento
- Saneamento
- Instrucao
- Audiencia
- Pericia
- Concluso para decisao
- Julgado
- Recursal
- Liquidacao
- Cumprimento de Sentenca
- Execucao

Manter fora de `Fase` e dentro de `Status` ou `Substatus`:

- Arquivado Definitivamente
- Arquivamento Provisorio
- Cancelado
- Suspenso
- Sobrestado

### Gaps mais provaveis no campo `Fase`

- `Recursal`
- `Liquidacao`
- `Execucao` quando nao for tratada como parte de `Cumprimento de Sentenca`

## Worker IA

O worker Cloudflare [hmadv-process-ai](/D:/Github/newgit/workers/hmadv-process-ai/src/index.ts) ja existe em codigo e ja consegue:

- analisar processo
- resumir andamentos/publicacoes/audiencias
- sugerir tarefas
- criar nota no Freshsales
- criar `tasks` no Freshsales

Mas ainda falta homologacao operacional fim a fim. Entao, hoje, a resposta correta e: a trilha de IA existe, mas ainda nao esta concluida como parte fechada do rollout.

## Slack conversacional

Ainda nao existe integracao Slack implementada no repositorio.

Ela e viavel com o que ja temos, usando:

- Slack app / bot
- Cloudflare Worker IA como camada conversacional
- Supabase como base de consulta
- Freshsales como camada de acao

### Casos de uso viaveis

- consultar processos, partes, publicacoes, movimentos e tasks
- resumir processos
- perguntar status, fase e instancia
- sugerir proxima acao
- abrir nota ou tarefa no Freshsales

### O que falta

- app Slack
- webhook / slash command / events
- autenticacao e controle de acesso
- camada de consulta segura ao Supabase
- politicas de acao no Freshsales
