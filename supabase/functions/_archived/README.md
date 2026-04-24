# Funções Arquivadas

Este diretório contém Edge Functions que foram **removidas do Supabase** por atingir o limite de 100 funções do plano Free, mas cujo código foi preservado para reimplementação futura.

## Como reimplantar

```bash
supabase functions deploy <nome-da-funcao> --project-ref sspvizogbcyigquqycsz
```

## Funções arquivadas

| Função | Data de Arquivamento | Motivo |
|---|---|---|
| `read-secrets-temp` | 2026-04-24 | Função temporária de diagnóstico de secrets |
| `advise-test-params` | 2026-04-24 | Função temporária de teste de parâmetros do Advise |
| `billing-debug` | 2026-04-24 | Função de debug do billing/Freshsales Deals |
| `fs-debug` | 2026-04-24 | Função de debug de autenticação do Freshsales |

> **Nota:** Antes de reimplantar, verifique se o limite de funções foi aumentado (upgrade de plano) ou se outra função pode ser removida para liberar espaço.
