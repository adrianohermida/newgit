# HMADV - Sync direto de Contacts do Freshsales

## Contexto

No HMADV atual:

- `public.freshsales_contacts` existe
- `public.freshsales_sync_snapshots` nao existe

Por isso, o script antigo [sync-freshsales-contacts.js](/D:/Github/newgit/scripts/sync-freshsales-contacts.js) nao atende o rollout do HMADV, porque depende de snapshots que nao foram provisionados neste projeto.

## Caminho recomendado

`Freshsales API -> public.freshsales_contacts -> reconciliador HMADV`

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

## Proximo passo

1. popular `freshsales_contacts`
2. rerodar [hmadv_auditar_cliente_contacts_cobertura.ps1](/D:/Github/newgit/docs/hmadv_auditar_cliente_contacts_cobertura.ps1)
3. evoluir o reconciliador para:
   - procurar `Contact` existente por nome normalizado
   - exigir marcador do escritorio
   - respeitar o polo inferido
   - manter bloqueio conservador quando faltar identificador seguro
