# HMADV - Rate Limit do Freshsales

## Premissa

O tenant do Freshsales deve respeitar teto de `1000` requisicoes por hora.

## Ajuste aplicado

No [sync-worker](/D:/Github/newgit/_hmadv_review/supabase/functions/sync-worker/index.ts), toda chamada `fsPost` agora respeita intervalo minimo global entre requests.

Variavel:

- `FRESHSALES_MIN_INTERVAL_MS`

Valor padrao sugerido:

- `4500`

Isso reduz a cadencia para algo abaixo de `1000/h`, com margem para retries e outras automacoes.

## Observacao

Mesmo com esse throttle, outras functions que chamem o Freshsales ainda contam na mesma cota do tenant. Por isso:

- manter lotes pequenos
- evitar execucoes concorrentes desnecessarias
- usar auditoria antes de disparar grandes backfills
