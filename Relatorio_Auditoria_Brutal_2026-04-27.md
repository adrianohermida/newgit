# Relatório de Auditoria Brutal e Exaustiva do Sistema (27/04/2026)

Após uma auditoria profunda de todas as Edge Functions, CRONs, Triggers e filas de banco de dados, identificamos as pendências residuais que ainda bloqueiam a sincronização total com o Freshsales. O orquestrador de rate limit está funcionando e protegendo o sistema (retornando HTTP 429 corretamente), mas há gargalos lógicos nas funções de negócio.

## 🔴 1. Bloqueio Crítico: Fila Datajud (8.649 processos parados)
A fila do Datajud (`judiciario.monitoramento_queue`) possui **8.649 processos pendentes** que não estão sendo processados porque a coluna `account_id_freshsales` está nula. 
- **O Problema:** A função `datajud-worker` possui uma regra estrita (`.not('account_id_freshsales', 'is', null)`) que a impede de processar qualquer item sem account.
- **A Causa Raiz:** O trigger `enqueue_datajud` insere itens na fila copiando o `account_id_freshsales` do processo no momento da inserção. Como os processos são criados *antes* da integração com o Freshsales, a coluna entra como nula. Quando o `processos:create_account` finalmente cria a conta e atualiza o processo, **não há nenhum trigger ou rotina que atualize a fila do Datajud** com o novo `account_id`.
- **Impacto:** O Datajud não busca andamentos para 8.649 processos. Como consequência, a fila de `movimentos` (andamentos) fica vazia para esses processos.
- **Correção Necessária:** Criar um trigger na tabela `processos` que, ao receber um `account_id_freshsales`, atualize todos os registros pendentes desse processo na tabela `monitoramento_queue`.

## 🔴 2. Erros 401 (JWT) em CRONs Secundários
Três CRONs estão falhando com erros de autenticação ou de payload:
- **`billing-deals-sync` (Erro 401 UNAUTHORIZED_LEGACY_JWT):** A função foi testada diretamente com sucesso, mas o CRON que a aciona ainda usa o JWT antigo ou está sem `verify_jwt = false` no `config.toml`. O orquestrador consegue chamá-la, mas o CRON independente falha.
- **`advise-ai-enricher` (Erro 401):** Mesmo problema do JWT legado.
- **`agentlab-runner-cron` e `billing-import-cron` (Erro SQL):** Ambos estão falhando com `null value in column "url" of relation "http_request_queue"`. Isso ocorre porque eles dependem do secret `SUPABASE_URL` no `vault.decrypted_secrets`, mas **todos os secrets do vault estão vazios** (a consulta retornou 0 resultados para SUPABASE_URL e chaves do Freshsales).

## 🟡 3. Erro de Ação no Orquestrador
- **`publicacoes-freshsales` e `publicacoes-partes`:** O orquestrador mapeia essas filas para a ação `sync_activity`, mas as funções esperam a ação `sync_batch`. O orquestrador chama `/functions/v1/publicacoes-freshsales?action=sync_activity`, a função não reconhece a ação e não processa nada.
- **Correção Necessária:** Atualizar o mapeamento no `orchestrator-engine` para enviar `action: "sync_batch"`.

## 🟡 4. CRON de Limpeza com Erro de Transação
- **`immediate-vacuum-cleanup`:** Este CRON tenta executar `VACUUM ANALYZE` via `pg_cron`. O PostgreSQL proíbe a execução de `VACUUM` dentro de blocos de transação (que é como o `pg_cron` opera por padrão).
- **Impacto:** O job falha a cada minuto com o erro `VACUUM cannot run inside a transaction block`.

## 📋 Plano de Correção Imediata (Sprint 5)
1. **Banco de Dados:** Criar trigger `trg_propagar_account_id_queue` na tabela `processos` para atualizar `monitoramento_queue.account_id_freshsales` sempre que um processo for vinculado ao Freshsales.
2. **Orquestrador:** Alterar a ação de `sync_activity` para `sync_batch` no mapeamento das publicações.
3. **Vault:** Recadastrar os secrets críticos (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) no vault do banco de dados para restaurar os CRONs de background.
4. **Config:** Garantir que `verify_jwt = false` esteja aplicado para todas as funções chamadas por CRONs internos.
