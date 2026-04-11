# HMADV - Fase 3 Partes por Publicacoes

## Objetivo

Fazer backfill de `judiciario.partes` a partir do conteudo historico de publicacoes.

## Script

- [hmadv_reconciliar_partes_publicacoes.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_partes_publicacoes.ps1)

## Uso

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"

powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_partes_publicacoes.ps1" -Limite 50
```

Aplicacao real:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_partes_publicacoes.ps1" -Aplicar -Limite 50
```

## Regra

- extrair `Parte(s): NOME (A|P)` do conteudo
- classificar `ativo` e `passivo`
- inferir `tipo_pessoa`
- fazer upsert por `processo_id,nome,polo`

## Criterio de aceite

- `processos_com_publicacoes_sem_partes = 0`