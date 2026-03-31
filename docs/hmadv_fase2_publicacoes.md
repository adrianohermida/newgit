# HMADV - Fase 2: Publicacoes nao-leilao -> Freshsales

## Objetivo

Garantir que toda publicacao existente no Supabase:

- esteja vinculada a um `processo_id` quando isso for juridicamente possivel;
- seja ignorada quando for leilao;
- seja exportada ao Freshsales quando for publicacao processual valida;
- atualize os detalhes do Sales Account com:
  - `Diario`
  - `Publicacao em`
  - `Conteudo publicacao`
  - `Data Ultimo Movimento`
  - `Descricao Ultimo Movimento`

## Fluxo atual que permanece oficial

- `advise-sync` ingere publicacoes
- `sync-worker` exporta publicacoes e ignora leilao
- `fs-account-repair` recalcula os campos do Sales Account

## O que falta fechar

### 1. Reconciliacao dirigida por processo

Usar:

- [hmadv_reconciliar_publicacoes.ps1](D:/Github/newgit/docs/hmadv_reconciliar_publicacoes.ps1)

Esse script:

- localiza publicacoes pendentes com `processo_id`;
- separa leilao de nao-leilao;
- agrupa por `processo_id`;
- opcionalmente chama `sync-worker?action=repair_process` por processo.

### 2. Backfill ate zerar pendencias nao-leilao

Rodar:

```powershell
$env:HMADV_SERVICE_ROLE="SEU_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_publicacoes.ps1" -ExecutarRepairProcess
```

## Criterio de aceite da Fase 2

- `publicacoes` pendentes nao-leilao tende a zero;
- `LEILAO_IGNORADO` so aparece nos casos de leilao/leiloes;
- cada publicacao valida cria apenas uma activity no Freshsales;
- `fs-account-repair` recalcula os campos do account apos a exportacao.

## Proximo passo apos a Fase 2

Quando as publicacoes nao-leilao estiverem sob controle:

1. extrair partes das publicacoes historicas;
2. popular `judiciario.partes`;
3. recalcular `polo_ativo` e `polo_passivo`;
4. preparar a trilha de audiencias como nova categoria de activity.
