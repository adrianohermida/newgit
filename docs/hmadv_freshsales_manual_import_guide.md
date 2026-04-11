# HMADV Freshsales Manual Import Guide

Este guia cobre a carga manual no Freshsales enquanto a publicação automática por API permanece limitada por rate limit/autorização do tenant.

## Arquivos gerados

- `Sales Accounts`: `D:\Github\newgit\out\freshsales-sales-accounts-import-1775868847204.csv`
- `Deals`: `D:\Github\newgit\out\freshsales-deals-import-1775868847248.csv`

## Ordem de importação

1. Importar `Sales Accounts`
2. Validar se as accounts foram criadas com o processo correto
3. Importar `Deals`

## Import 1: Sales Accounts

Arquivo:
- `D:\Github\newgit\out\freshsales-sales-accounts-import-1775868847204.csv`

Colunas do CSV:
- `name`
- `cf_processo`
- `description`
- `source`
- `contract_id`

Mapeamento recomendado no Freshsales:
- `name` -> `Nome da conta`
- `cf_processo` -> campo customizado `Processo`
- `description` -> `Descrição`

Campos auxiliares:
- `source`
- `contract_id`

Podem ser ignorados se o import do tenant não suportar esses campos.

## Import 2: Deals

Arquivo:
- `D:\Github\newgit\out\freshsales-deals-import-1775868847248.csv`

Colunas base do CSV:
- `name`
- `amount`
- `currency`
- `expected_close`
- `deal_stage_id`
- `sales_account_id`
- `sales_account_name`
- `contact_id`
- `contact_email`
- `external_reference`
- `receivable_id`
- `contract_id`

Colunas financeiras adicionais:
- `cf_referencia_fatura`
- `cf_saldo_a_pagar`
- `cf_acrscimo_de_correcao`
- `cf_juros_de_mora`
- `cf_juros_compensatrios_valor`

Dependendo do `.dev.vars`, outras colunas customizadas também podem aparecer.

Mapeamento recomendado no Freshsales:
- `name` -> `Nome`
- `amount` -> `Valor da negociação`
- `currency` -> `Moeda`
- `expected_close` -> `Data do fechamento`
- `deal_stage_id` -> `Fase da negociação`
- `sales_account_name` -> relacionamento com `Nome da conta`
- `contact_email` -> relacionamento com contato por e-mail
- `cf_referencia_fatura` -> `Referência Fatura`
- `cf_saldo_a_pagar` -> `Saldo a pagar`
- `cf_acrscimo_de_correcao` -> `Acréscimo de Correção`
- `cf_juros_de_mora` -> `Juros de mora (R$)`
- `cf_juros_compensatrios_valor` -> `Juros Compensatórios (R$)`

## Observações importantes

- Hoje o CSV de `Deals` saiu com `sales_account_id` vazio em todos os itens.
- Por isso o relacionamento deve ser feito no import pelo campo `sales_account_name`.
- O relacionamento com contato deve ser feito por `contact_email`.
- `external_reference`, `receivable_id` e `contract_id` devem ser preservados se o tenant permitir, porque ajudam na reconciliação posterior.

## Validação pós-import

Depois da importação:

1. Verificar se as `Sales Accounts` existem e têm o processo correto.
2. Verificar se os `Deals` ficaram ligados ao contato certo.
3. Verificar se os `Deals` ficaram ligados à `Account` certa.
4. Rodar novamente o sync/reconciliação local para trazer de volta os IDs criados no Freshsales.

## Próximo passo técnico após o import

Quando a carga manual estiver pronta, executar:

```powershell
npm run sync:freshsales-contacts
npm run sync:freshsales-products
npm run report:hmadv-ops
```

E então ajustar o backfill para reconciliar os registros já criados no Freshsales.
