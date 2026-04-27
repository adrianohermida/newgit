# Relatório de Arquitetura: Orquestração e Saneamento Contínuo

**Autor:** Manus AI  
**Data:** 25 de Abril de 2026  
**Projeto:** HMADV / Newgit  

Este documento detalha a arquitetura do novo sistema de orquestração inteligente implementado no projeto Supabase, desenhado para gerenciar de forma autônoma a atualização, sincronização e saneamento de todas as entidades jurídicas (Processos, Partes, Publicações, Movimentos e Audiências) entre Supabase, Freshsales, Advise e DataJud.

O objetivo principal desta implementação foi eliminar o retrabalho, respeitar os limites de requisição (Rate Limit de 990 chamadas/hora ao Freshsales) e garantir que as 47.811 pendências atuais sejam drenadas de forma segura e contínua.

## 1. O Problema Anterior

Antes da implementação, o sistema operava com CRONs estáticos e isolados. Cada Edge Function acordava em horários predefinidos, fazia uma query no banco e tentava processar o máximo de itens possível. 

Isso gerava três problemas críticos:
1. **Concorrência e Rate Limit:** Múltiplos CRONs rodando ao mesmo tempo geravam mais de 2.500 chamadas/hora ao Freshsales, estourando o limite da API e causando falhas em cascata.
2. **Retrabalho (Falta de Idempotência):** Funções tentavam sincronizar repetidamente itens que já haviam sido processados ou que haviam falhado de forma permanente, desperdiçando recursos computacionais.
3. **Falta de Visibilidade:** Não havia uma visão unificada de quantas pendências existiam por entidade ou de quando o sistema estaria 100% saneado.

## 2. A Nova Arquitetura: O Maestro e o Vigia

O novo sistema substitui a execução "cega" por uma arquitetura orientada a dados, composta por três pilares principais:

### 2.1. O Banco de Dados como Fonte da Verdade
Foi criada a tabela central `sync_orchestrator` e a função SQL `orchestrator_check_pendencias()`. O banco agora calcula em tempo real o volume exato de pendências em 9 filas diferentes, priorizando o que é mais urgente.

**Mapa Real de Pendências (Snapshot atual):**

| Entidade | Ação Necessária | Volume Pendente | Prioridade |
| :--- | :--- | :--- | :--- |
| **Processos** | Criar Account no Freshsales | 7.066 | Alta (1) |
| **Publicações** | Sincronizar Atividade (Advise) | 11.217 | Alta (2) |
| **Movimentos** | Sincronizar Atividade (DataJud) | 18.443 | Média (3) |
| **Partes** | Criar Contact no Freshsales | 5.027 | Média (4) |
| **Audiências** | Sincronizar Atividade | 0 | Baixa (5) |
| **Prazos** | Criar Task no Freshsales | 2.942 | Baixa (6) |
| **DataJud** | Buscar novos movimentos | 3.113 | Rotina (7) |
| **Advise** | Drenar fila de publicações | 3 | Rotina (8) |
| **Advise** | Backfill histórico | 0 | Baixa (9) |

*Total de pendências a drenar: 47.811 itens.*

### 2.2. Edge Function: `orchestrator-engine` (O Maestro)
Um novo CRON roda a cada 5 minutos acionando o `orchestrator-engine`. Esta função atua como um "maestro":
- Consulta a função SQL para ver o estado de todas as filas.
- Verifica o Rate Limit disponível na hora atual (teto de 990 chamadas).
- Decide dinamicamente qual Edge Function acionar com base na prioridade e no "orçamento" de requisições restante.
- Aciona a função escolhida (ex: `processo-sync` ou `publicacoes-freshsales`) passando o tamanho de lote ideal.

Isso garante que o sistema nunca fique ocioso se houver pendências e limite disponível, mas também nunca ultrapasse o teto da API.

### 2.3. Edge Function: `sync-health-monitor` (O Vigia)
Roda duas vezes ao dia (08h e 18h) para auditar a saúde do ecossistema.
- Se todas as filas chegarem a zero, o sistema atingiu o **Saneamento 100%**.
- Envia um relatório proativo para o canal do Slack da equipe com o progresso da drenagem e alertas de anomalias (ex: aumento repentino de erros de sincronização).

## 3. Idempotência e Prevenção de Retrabalho

Para garantir que as 47.811 pendências sejam processadas uma única vez, foram implementadas três camadas de proteção nas Edge Functions trabalhadoras:

1. **Colunas de Controle:** Adicionadas `fs_sync_status`, `fs_sync_retries` e `fs_sync_next_retry` na tabela de publicações.
2. **Backoff Exponencial:** Se um item falha ao sincronizar (ex: erro de rede), ele não trava a fila. O sistema agenda a próxima tentativa para 5 minutos, depois 10, 20, 40, até o máximo de 5 tentativas. Após isso, é marcado como `failed` permanente e ignorado.
3. **Skip Inteligente (SQL):** Funções `skip_if_synced_publicacao` e `skip_if_synced_processo` garantem no nível do banco que itens já com `activity_id` ou `account_id` sejam pulados antes mesmo de gastar memória da Edge Function.

## 4. O Módulo Compartilhado de Rate Limit

Foi criado um módulo centralizado em `_shared/rate-limit.ts` que foi importado e integrado nas 7 funções mais pesadas do sistema:
- `publicacoes-freshsales`
- `fs-account-repair`
- `fs-repair-orphans`
- `processo-sync`
- `datajud-andamentos-sync`
- `datajud-worker`
- `publicacoes-audiencias`

**Como funciona:** Antes de fazer o `fetch` para a API do Freshsales, a função invoca `checkRateLimit()`. Se o retorno for `ok: false`, a função aborta o processamento graciosamente, salvando o progresso e encerrando a execução. O orquestrador tentará novamente na próxima janela.

## 5. Próximos Passos e Expectativas

Com a arquitetura atualizada e deployada no projeto Supabase `sspvizogbcyigquqycsz`:

1. **Drenagem Automática:** As 47.811 pendências começarão a ser drenadas continuamente a um ritmo máximo de 990 itens por hora.
2. **Tempo Estimado:** Devido ao limite imposto pela API do Freshsales, o saneamento completo das filas atuais levará aproximadamente **2 a 3 dias** de processamento ininterrupto e seguro.
3. **Manutenção Zero:** Após a drenagem, o orquestrador entrará em modo de "cruzeiro", processando apenas as novas publicações e andamentos do dia, mantendo o sistema em 100% de sincronia perpétua.

Todas as alterações, incluindo as 3 novas Edge Functions e as 4 migrações SQL, foram commitadas e estão seguras na branch `main` do repositório `adrianohermida/newgit`.
