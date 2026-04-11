# HMADV - Sync direto de Contacts do Freshsales

## Contexto

No HMADV atual:

- `public.freshsales_contacts` existe
- `public.freshsales_sync_snapshots` nao existe
- a chave atual do tenant pode nao ter permissao para `contacts/view/1`

Por isso, o script antigo [sync-freshsales-contacts.js](/D:/Github/newgit/scripts/sync-freshsales-contacts.js) nao atende o rollout do HMADV, porque depende de snapshots que nao foram provisionados neste projeto.

## Caminho recomendado

`Freshsales API -> public.freshsales_contacts -> reconciliador HMADV`

Com o fluxo atual do modulo `interno/contatos`, o caminho operacional completo passou a ser:

`Freshsales Contacts -> public.freshsales_contacts -> client_profiles (portal) -> interno/contatos`

e no sentido inverso:

`portal/perfil -> client_profiles -> Freshsales Contacts -> public.freshsales_contacts`

No tenant HMADV, a base preferencial deve ser:

- `https://hmadv-7b725ea101eff55.freshsales.io/api`

O script novo:

1. tenta `contacts/view/1`
2. se receber `403`, faz fallback para:
   - `sales_accounts/{id}/contacts`
   - usando as `Sales Accounts` ja vinculadas em `judiciario.processos`

## Script

- [sync-hmadv-freshsales-contacts-direct.js](/D:/Github/newgit/scripts/sync-hmadv-freshsales-contacts-direct.js)
- [hmadv_sync_freshsales_contacts.ps1](/D:/Github/newgit/docs/hmadv_sync_freshsales_contacts.ps1)

## Dry run

```bash
node scripts/sync-hmadv-freshsales-contacts-direct.js --dry-run --limit 100
```

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_sync_freshsales_contacts.ps1" `
  -SupabaseUrl "https://sspvizogbcyigquqycsz.supabase.co" `
  -ServiceRole "SUA_SERVICE_ROLE" `
  -FreshsalesApiBase "https://hmadv-org.myfreshworks.com/crm/sales/api" `
  -FreshsalesApiKey "SUA_FRESHSALES_API_KEY" `
  -DryRun `
  -Limite 100
```

## Importacao real

```bash
node scripts/sync-hmadv-freshsales-contacts-direct.js --limit 5000
```

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_sync_freshsales_contacts.ps1" `
  -SupabaseUrl "https://sspvizogbcyigquqycsz.supabase.co" `
  -ServiceRole "SUA_SERVICE_ROLE" `
  -FreshsalesApiBase "https://hmadv-org.myfreshworks.com/crm/sales/api" `
  -FreshsalesApiKey "SUA_FRESHSALES_API_KEY" `
  -Limite 5000
```

## Requisitos

- `SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRESHSALES_API_BASE` ou `FRESHSALES_BASE_URL` ou `FRESHSALES_DOMAIN`
- `FRESHSALES_API_KEY` ou `FRESHSALES_ACCESS_TOKEN`
- `FRESHSALES_OAUTH_CONTACTS_CLIENT_ID`
- `FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET`
- `FRESHSALES_CONTACTS_SCOPES`
- `FRESHSALES_ORG_DOMAIN`
- `FRESHSALES_REDIRECT_URI`

## Webhook de contacts

Para refletir alteracoes do CRM sem depender apenas do runner, o app de `contacts` no Freshsales deve disparar webhook para `fs-webhook` com `contact.id`.

Payload minimo recomendado:

```json
{
  "contact_id": "{{contact.id}}",
  "account_id": "{{contact.sales_account_id}}",
  "email": "{{contact.email}}"
}
```

Esse webhook agora enfileira um job `sync_contacts` no modulo `contacts`, que:

1. consulta o contato no Freshsales por id
2. atualiza o espelho local em `public.freshsales_contacts`
3. tenta refletir o dado no portal quando houver match de cliente

## Proximo passo

1. popular `freshsales_contacts`
2. rerodar [hmadv_auditar_cliente_contacts_cobertura.ps1](/D:/Github/newgit/docs/hmadv_auditar_cliente_contacts_cobertura.ps1)
3. evoluir o reconciliador para:
   - procurar `Contact` existente por nome normalizado
   - exigir marcador do escritorio
   - respeitar o polo inferido
   - manter bloqueio conservador quando faltar identificador seguro
4. usar [hmadv_freshsales_contacts_diagnostico.md](/D:/Github/newgit/docs/hmadv_freshsales_contacts_diagnostico.md) quando houver duvida de permissao no tenant
