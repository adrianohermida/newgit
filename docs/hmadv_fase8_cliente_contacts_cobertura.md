# HMADV - Cobertura de Cliente e Contacts

## Objetivo

Medir a prontidao real da frente `cliente principal + contacts relacionados`.

O auditor mede:

- quantos processos com account ja tem `partes`
- quantos processos com account tem marcador explicito do escritorio nas publicacoes
- quantas `partes` ja tem `documento`
- quantos processos ja teriam dado minimo para subir `Contact` com seguranca

Os marcadores do escritorio sao procurados em:

- `raw_payload.nomeCliente`
- `raw_payload.nomeUsuarioCliente`
- conteudo da publicacao

## Script

- [hmadv_auditar_cliente_contacts_cobertura.ps1](/D:/Github/newgit/docs/hmadv_auditar_cliente_contacts_cobertura.ps1)

## Uso

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_auditar_cliente_contacts_cobertura.ps1" -Limite 100
```

Com OABs do escritorio:

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_auditar_cliente_contacts_cobertura.ps1" `
  -Limite 100 `
  -OfficeOabs "SP-166712","SP-123456"
```

## Leitura

Campos principais:

- `processos_com_marker_escritorio`
- `processos_com_algum_documento`
- `partes_com_documento`

## Decisao operacional

Se `processos_com_marker_escritorio` estiver baixo:

- precisamos ampliar a lista real de marcadores do escritorio
- ou usar outra fonte de representacao

Se `partes_com_documento` estiver baixo:

- a criacao automatica de `Contact` deve permanecer bloqueada
- e a fase deve seguir primeiro com canonizacao no Supabase
