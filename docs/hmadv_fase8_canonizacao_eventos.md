# HMADV - Fase 8 Canonizacao por Eventos

## Objetivo

Dar o proximo passo da fase 8, saindo do fallback simples e passando a canonizar:

- `status_atual_processo`
- `polo_ativo`
- `polo_passivo`

com base em evidencia real de:

- `judiciario.processo_evento_regra`
- `judiciario.movimentos`
- `judiciario.publicacoes`
- `judiciario.partes`
- titulo do processo como ultimo fallback

## Script operacional

- [hmadv_canonizar_polos_status_eventos.ps1](/D:/Github/newgit/docs/hmadv_canonizar_polos_status_eventos.ps1)

## Regras aplicadas

### Status

- primeiro tenta classificar por `movimentos`
- depois por `publicacoes`
- se nao houver evento forte:
  - preserva o que ja existe
  - ou cai em `Ativo` somente quando o status ainda estiver vazio

### Polos

Ordem de prioridade:

1. `judiciario.partes`
2. conteudo das `publicacoes`
3. titulo do processo como fallback

## Uso

### Auditoria

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_canonizar_polos_status_eventos.ps1" -Limite 50
```

### Aplicacao real

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_canonizar_polos_status_eventos.ps1" -Aplicar -Limite 100
```

## Criterio de aceite

- processos com account passam a ter `status_atual_processo` com fonte auditavel
- `status_fonte` deixa de ficar majoritariamente em `fallback`
- `polo_ativo` e `polo_passivo` passam a ser preenchidos primeiro por evidencias de negocio
- o backfill de account do Freshsales passa a refletir a canonizacao do Supabase
