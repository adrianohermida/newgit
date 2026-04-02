# HMADV - Backfill Inicial de Polos e Status

## Objetivo

Executar um backfill conservador nos casos simples da fase 8:

- preencher `polo_ativo` e `polo_passivo` a partir do titulo do processo quando ele estiver no formato `(ativo x passivo)`;
- preencher `status_atual_processo = Ativo` quando ainda nao houver sinal de baixa ou suspensao persistido.

## Script

- [hmadv_backfill_polos_status.ps1](/D:/Github/newgit/docs/hmadv_backfill_polos_status.ps1)

## Modo auditoria

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_backfill_polos_status.ps1" -Limite 100
```

## Aplicacao real

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_backfill_polos_status.ps1" -Aplicar -Limite 100
```

## Regra usada

- `polo_ativo` e `polo_passivo` so sao preenchidos quando o titulo trouxer `(<ativo> x <passivo>)`
- `status_atual_processo` vira `Ativo` apenas quando estiver nulo
- `status_fonte = fallback`
- `status_evento_origem = ausencia_de_evento_de_baixa_ou_suspensao`

## Limite proposital

Esse backfill e inicial e conservador.

Ele nao substitui:

- reconciliacao por publicacoes
- reconciliacao por `judiciario.partes`
- aplicacao das regras de `judiciario.processo_evento_regra`

## Ordem no rollout

Sem pular etapas:

1. grant de `audiencias` ja aplicado
2. homologar `Audiências + Consulta + Appointment` quando surgir caso real
3. usar este backfill inicial para reduzir nulos simples
4. depois implementar o reconciliador completo de `Contacts + Polos + Status`
