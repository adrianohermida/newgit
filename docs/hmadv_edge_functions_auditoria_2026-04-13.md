# Auditoria de Edge Functions HMADV

Data: 2026-04-13

## Objetivo

Mapear o que ja existe nas edge functions para evitar retrabalho na integracao Datajud + Advise + Freshsales + Supabase.

## Fluxos oficiais recomendados

### OAuth Freshsales

- Funcao oficial: `supabase/functions/oauth/index.ts`
- Status: pronta para `deals` e `contacts`
- Acoes: `authorize`, `callback`, `token`, `status`, `refresh`, `seed`
- Providers:
  - `freshsales`
  - `freshsales_contacts`
- Observacao:
  - em 2026-04-13 o `seed` foi corrigido para respeitar variaveis segregadas por `kind`

### Webhook Freshsales

- Funcao oficial: `supabase/functions/fs-webhook/index.ts`
- Status: pronta
- Papel:
  - recebe webhook
  - responde rapido
  - enfileira processamento
  - quando recebe `contactId`, cria job `contacts/sync_contacts`

### Publicacoes Advise

- Funcao oficial: `supabase/functions/advise-sync/index.ts`
- Status: pronta
- Papel:
  - busca publicacoes do Advise
  - aplica filtro de leilao
  - persiste em `judiciario.publicacoes`
  - aceita escopo por `processNumbers`

### Orquestracao tagged Datajud

- Funcao oficial: `supabase/functions/datajud-webhook/index.ts`
- Status: pronta
- Papel:
  - monta escopo de contas tagged `datajud`
  - chama `advise-sync`
  - chama `publicacoes-freshsales`
  - chama `sync-worker`

### Envio de publicacoes ao Freshsales

- Funcao oficial: `supabase/functions/publicacoes-freshsales/index.ts`
- Status: pronta
- Papel:
  - resolve processo
  - vincula publicacao
  - cria activity
  - trata prazos/tasks

## Funcoes auxiliares e probes

### Freshworks/Freshsales probes

- `freshworksAuthorizeUrlProbe`
- `freshworksOauthCallbackProbe`
- `freshworksOauthExchangeProbe`
- `freshsalesWhoamiProbe`
- `freshsalesInventoryProbe`
- `freshsalesEntityDetailProbe`
- `freshsalesSchemaProbe`
- outras `freshsales*Probe`

Uso recomendado:

- diagnostico
- smoke test
- descoberta de schema e permissao

Uso nao recomendado:

- virar fluxo principal de producao

## Funcoes com sobreposicao ou legado operacional

### Advise legado/paralelo

- `sync-advise-publicacoes`
- `sync-advise-realtime`
- `sync-advise-backfill`

Leitura atual:

- ainda sao uteis para historico, backfill e diagnostico
- mas se sobrepoem ao fluxo mais completo de `advise-sync`
- recomendacao: manter como apoio, nao como entrypoint principal da operacao diaria

## Gaps reais identificados

### Gap resolvido nesta data

- `oauth?action=seed` usava apenas token global
- ajuste aplicado para aceitar:
  - `FRESHSALES_CONTACTS_ACCESS_TOKEN`
  - `FRESHSALES_CONTACTS_REFRESH_TOKEN`
  - `FRESHSALES_CONTACTS_EXPIRES_IN`
  - `FRESHSALES_CONTACTS_TOKEN_EXPIRY`
  - `FRESHSALES_CONTACTS_TOKEN_TYPE`

### Gap ainda operacional

- o fluxo de `contacts` depende de token valido em runtime para o modulo contacts
- o enqueue do job ja existe, mas a execucao completa ainda depende das credenciais segregadas estarem disponiveis

## Decisao recomendada

Adotar a seguinte fonte de verdade:

- OAuth: `oauth`
- entrada webhook Freshsales: `fs-webhook`
- ingestao Advise: `advise-sync`
- envio de publicacoes ao CRM: `publicacoes-freshsales`
- orquestracao tagged: `datajud-webhook`

E tratar as demais como:

- probes de diagnostico
- backfill historico
- funcoes de apoio

## Proximos passos recomendados

1. Validar em runtime o `oauth?action=seed&kind=contacts` com os secrets segregados.
2. Confirmar qual worker/endpoint consome efetivamente os jobs `contacts/sync_contacts`.
3. Consolidar runbook unico para:
   - authorize contacts
   - seed contacts
   - validar status
   - testar sync de contato
