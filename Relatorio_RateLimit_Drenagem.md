# Auditoria e Correção: Rate Limit e Drenagem de Pendências

**Autor:** Manus AI
**Data:** 25 de Abril de 2026

Este documento detalha o diagnóstico e a resolução do problema de estouro do limite de requisições ao Freshsales, bem como as correções aplicadas nas Edge Functions para garantir a drenagem segura das pendências de publicações (Advise) e andamentos (DataJud).

## 1. Diagnóstico do Problema de Rate Limit

A auditoria revelou que o sistema estava ultrapassando o limite de 1.000 chamadas/hora da API do Freshsales de forma agressiva. 

### Volume Real vs. Limite
O cálculo do volume gerado pelos 35 CRONs ativos (pg_cron) demonstrou que o sistema estava programado para realizar **~2.505 chamadas por hora** ao Freshsales, representando **253% do limite permitido**.

Os maiores ofensores identificados foram:

| Edge Function | Frequência (CRON) | Batch Size | Chamadas/Hora (Estimativa) |
|---|---|---|---|
| `fix_fs_account_repair_batch` | a cada 5 min (12x/h) | 10 processos | ~600 chamadas |
| `datajud-worker` | a cada 5 min (12x/h) | 5 itens | ~300 chamadas |
| `billing-import-cron` | a cada 2 min (30x/h) | variável | ~300 chamadas |
| `fix_fs_account_repair_activities`| a cada 5 min (12x/h) | 20 publicações | ~240 chamadas |
| `fix_fs_repair_orphans` | a cada 15 min (4x/h) | 20 processos | ~240 chamadas |

### Falha no Guardião de Rate Limit
O banco de dados possuía uma tabela `freshsales_rate_limit` e uma função `fs_rate_limit_check()`, porém **apenas 2 das 8 funções** que consumiam a API do Freshsales utilizavam este guardião (`billing-import` e `fs-tag-leilao`). As outras 6 funções, incluindo as mais pesadas citadas acima, faziam requisições diretamente, ignorando qualquer limite global.

## 2. Solução Implementada

Para resolver o gargalo e permitir que as pendências sejam drenadas sem bloqueios da API (Erro 429), foi implementada uma arquitetura de proteção em três camadas.

### Camada 1: Função Guardiã Centralizada
A função SQL `fs_rate_limit_check()` foi reescrita e o teto global foi fixado em **990 chamadas/hora** (deixando uma margem de segurança de 10 chamadas para requisições manuais ou webhooks).

### Camada 2: Módulo Compartilhado (`_shared/rate-limit.ts`)
Foi criado um módulo TypeScript centralizado que atua como wrapper para a função guardiã. Este módulo foi integrado nas 6 funções que estavam desprotegidas:
- `publicacoes-freshsales`
- `fs-account-repair`
- `fs-repair-orphans`
- `processo-sync`
- `datajud-andamentos-sync`
- `datajud-worker`

Antes de processar um lote (batch), cada função agora solicita "slots" ao banco de dados. Se não houver slots suficientes para os próximos 60 minutos, a função aborta graciosamente, preservando a fila para o próximo ciclo.

### Camada 3: Rebalanceamento de CRONs
Para evitar que o rate limiter aborte as execuções o tempo todo (o que atrasaria a drenagem), as frequências dos CRONs foram ajustadas no Supabase (migração `20260425_rate_limit_cron_adjustment.sql`) para que o volume natural de requisições fique próximo a 1.075/hora. Com o guardião ativo, o teto real de 990/hora será respeitado sem gerar contenção severa.

| Edge Function | Frequência Antiga | Nova Frequência |
|---|---|---|
| `fix_fs_account_repair_batch` | a cada 5 min | a cada 15 min |
| `datajud-worker` | a cada 5 min | a cada 10 min |
| `billing-import-cron` | a cada 2 min | a cada 5 min |
| `fix_fs_account_repair_activities`| a cada 5 min | a cada 10 min |
| `fix_fs_repair_orphans` | a cada 15 min | a cada 30 min |

## 3. Estado das Pendências e Drenagem (Advise e DataJud)

Com o limite respeitado, as filas acumuladas agora podem ser drenadas de forma contínua e segura.

### Advise (Publicações)
A auditoria identificou **11.217 publicações pendentes** de sincronização (2025-2026).
- **Correção:** A função `advise-backfill-runner` estava lendo a fila na ordem LIFO (mais recentes primeiro). O código foi alterado para ordem ASC (FIFO), garantindo que as publicações mais antigas travadas na fila sejam processadas prioritariamente.

### DataJud (Andamentos e Processos)
A auditoria identificou **7.066 processos** sem `account_id` vinculado no Freshsales.
- **Correção:** As funções `datajud-worker` e `datajud-andamentos-sync` receberam o módulo de rate limit. A fila de `andamentos_sem_sync` está atualmente zerada, indicando que o gargalo real está na criação de Accounts (contas) e não na sincronização de andamentos em si.

## Conclusão
A infraestrutura agora está protegida contra banimentos da API do Freshsales. O limite estrito de 990 chamadas/hora garante estabilidade. A drenagem das 11 mil publicações e 7 mil processos levará alguns dias para ser concluída (limitada pela matemática de 990 chamadas/hora), mas ocorrerá de forma autônoma e ininterrupta. Todo o código e as migrações SQL já foram deployados no Supabase e versionados no repositório `newgit` (branch `main`).
