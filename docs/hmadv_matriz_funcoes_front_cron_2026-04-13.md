# Matriz operacional HMADV

Data: 2026-04-13

## Objetivo

Validar se as funcoes expostas no frontend de processos:

- chegam corretamente ao backend
- possuem handler real
- podem rodar em cron/runner
- e quais pendencias ainda impedem chamar o fluxo de totalmente automatico

## Fonte principal

- Frontend: `pages/interno/processos.js`
- Endpoint ponte: `functions/api/admin-hmadv-processos.js`
- Regras/processamento: `functions/lib/hmadv-ops.js`
- Contacts: `functions/lib/hmadv-contacts.js`
- Runner/cron: `functions/lib/hmadv-runner.js`

## Matriz

| Funcao | Frontend | Backend real | Cron/runner | Status | Pendencia real |
| --- | --- | --- | --- | --- | --- |
| Buscar movimentacoes no DataJud | sim | `enriquecer_datajud` com `intent=buscar_movimentacoes` | sim | pronto | depende de carteira tagged elegivel em runtime |
| Corrigir campos no Freshsales | sim | `repairFreshsalesAccounts()` | parcial | parcial | nao esta encaixado como etapa dedicada do runner principal |
| Sincronizar movimentacoes no Freshsales | sim | `syncMovementActivities()` | sim | pronto | depende de account vinculado e backlog real |
| Sincronizar publicacoes no Freshsales | sim | `syncPublicationActivities()` | sim | pronto | sem gap estrutural relevante |
| Reconciliar partes com contatos | sim | `reconcilePartesContacts()` | sim | parcial | precisa de contacts OAuth/tokens estaveis em runtime |
| Retroagir audiencias | sim | `backfillAudiencias()` | parcial | parcial | runner cobre sync de audiencias, mas nao esse backfill como etapa padrao |
| Sincronizar monitorados | sim | `enriquecer_datajud` com `intent=sincronizar_monitorados` | sim | parcial | painel ainda mostra leitura `unsupported` para monitoramento |
| Reenriquecer processos com gap | sim | `enriquecer_datajud` com `intent=reenriquecer_gaps` | parcial | parcial | runner repara gaps, mas nao exposto como etapa dedicada com esse intent |
| Rodar sync-worker | sim | `runSyncWorker()` | sim | pronto | sem pendencia estrutural |
| Criar accounts no Freshsales | sim | `pushOrphanAccounts()` | parcial | parcial | nao aparece como etapa dedicada do cron principal |
| Sincronizar Supabase + Freshsales | sim | `syncProcessesSupabaseCrm()` | sim | pronto | sem pendencia estrutural |
| Sincronizar movimentacoes | sim | `syncMovementActivities()` | sim | pronto | mesma pendencia do fluxo no Freshsales |
| Sincronizar publicacoes | sim | `syncPublicationActivities()` | sim | pronto | mesma pendencia do fluxo no Freshsales |
| Reconciliar partes | sim | `reconcilePartesContacts()` | sim | parcial | mesma pendencia de contacts em runtime |
| Rodar auditoria | sim | `runProcessAudit()` | nao dedicado | parcial | acao ainda manual, fora do runner principal |
| Drenar fila HMADV | sim | `run_pending_jobs` / `drainHmadvQueues()` | sim | pronto | depende apenas de runner/token ativos |

## Leitura executiva

### Ja esta forte o suficiente para operacao automatica

- Buscar movimentacoes no DataJud
- Sincronizar movimentacoes no Freshsales
- Sincronizar publicacoes no Freshsales
- Rodar sync-worker
- Sincronizar Supabase + Freshsales
- Drenar fila HMADV

### Ja funciona, mas ainda nao esta no nivel "posso esquecer"

- Reconciliar partes com contatos
- Reconciliar partes
- Sincronizar monitorados
- Reenriquecer processos com gap
- Retroagir audiencias
- Corrigir campos no Freshsales
- Criar accounts no Freshsales
- Rodar auditoria

## Pendencias reais

### 1. Contacts ainda e a principal pendencia operacional

O codigo esta pronto, inclusive com webhook/job/reconciliacao, mas a operacao automatica fica realmente estavel so quando o runtime tiver:

- token valido para contacts
- refresh token valido para contacts
- espelho `freshsales_contacts` populado de forma confiavel

### 2. Monitoramento ainda nao tem observabilidade madura no painel

As leituras de:

- `monitoramento_ativo`
- `monitoramento_inativo`

podem cair em `unsupported` ou fallback. A acao existe, mas a leitura operacional ainda nao esta 100% confiavel.

### 3. Existem acoes importantes que ainda nao sao etapa dedicada do cron principal

Hoje o runner principal cobre bem:

- DataJud tagged
- Advise
- publicacoes
- movimentacoes
- contacts
- fila

Mas nao encontrei como etapa dedicada do cron principal:

- `repair_freshsales_accounts`
- `push_orfaos`
- `backfill_audiencias`
- `runProcessAudit`

### 4. A validacao acima foi estrutural, nao um smoketest ponta a ponta de cada botao

O desenho esta consistente no codigo. Ainda falta, se quisermos chamar de 100% fechado:

- smoketest real de cada grupo de acao no ambiente
- com foco em DataJud, contacts, monitoramento e audiencias

## Decisao recomendada

Para considerar o projeto "quase autonomo", ja podemos operar com a regra:

- marcar a account com tag `datajud`
- deixar o runner cuidar de DataJud, Advise, publicacoes, movimentacoes, fila e boa parte dos reparos

Para considerar o projeto "fechado e descansavel", ainda faltam:

1. estabilizar contacts em runtime
2. fechar a observabilidade de monitoramento
3. decidir se auditoria, backfill de audiencias, criacao de accounts e repair de campos entram no cron principal ou ficam assumidamente manuais

## Proximo passo recomendado

Executar um smoketest operacional por grupos:

1. DataJud + CRM
2. Publicacoes + movimentacoes
3. Contacts
4. Monitoramento + audiencias

Se esses quatro grupos passarem, o fluxo tagged `datajud` fica suficientemente maduro para operacao continua com baixa intervencao manual.
