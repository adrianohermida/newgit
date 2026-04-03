# HMADV - Diagnostico de Contacts no Freshsales

## Objetivo

Validar rapidamente quais rotas de `Contacts` o tenant HMADV realmente permite usar com a chave atual.

## Script

- [hmadv_diagnosticar_freshsales_contacts.ps1](/D:/Github/newgit/docs/hmadv_diagnosticar_freshsales_contacts.ps1)

## Uso

```powershell
$env:FRESHSALES_API_BASE="https://hmadv-7b725ea101eff55.freshsales.io"
$env:FRESHSALES_API_KEY="SUA_FRESHSALES_API_KEY"

powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_diagnosticar_freshsales_contacts.ps1"
```

## Leitura esperada no HMADV

- `contacts/view/1` pode retornar `403`
- `settings/contacts/fields` deve retornar `200`
- `sales_accounts/{id}/contacts` pode retornar `200`, mesmo quando vazio

## Conclusao operacional

Se `contacts/view/1` continuar com `403`, a trilha de sincronizacao do HMADV deve usar:

`Sales Accounts vinculadas no Supabase -> sales_accounts/{id}/contacts`

e nao depender de listagem global de `Contacts`.
