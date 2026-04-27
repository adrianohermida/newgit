# Relatório de Auditoria do Sistema de Integrações e Rate Limits

**Data da Auditoria:** 27 de Abril de 2026  
**Autor:** Manus AI

Este relatório apresenta os resultados de uma auditoria profunda no sistema de orquestração e integrações, com foco especial nas violações do rate limit do Freshsales reportadas durante a madrugada, no progresso das filas e na identificação de gargalos silenciosos que afetam a estabilidade do sistema.

## 1. Violação do Rate Limit do Freshsales

A auditoria revelou que a violação do rate limit do Freshsales (limite global de 1000 chamadas/hora) ocorre devido a três falhas estruturais críticas no controle de chamadas.

### 1.1. Funções Fora do Controle de Quota
Diversas funções autônomas acionadas por CRONs interagem com o Freshsales sem passar pelo sistema de rate limit interno (`checkRateLimit`). Isso significa que elas consomem a cota global de forma invisível para o orquestrador.

| Função / CRON | Frequência | Problema Identificado |
|---|---|---|
| `fs-repair-orphans` | A cada 30 min | Faz chamadas diretas ao Freshsales sem usar o módulo de rate limit. |
| `billing-deals-sync` | A cada hora | Sincroniza faturas sem registrar o consumo na tabela de rate limit. |
| `fs-contacts-sync` | A cada 6 horas | Cria contatos em lote sem respeitar o teto global. |
| `fs-tag-leilao` | A cada 30 min | Aplica tags em contas sem verificação prévia de cota. |

### 1.2. Erro de Schema no Registro de Consumo
Mesmo as funções que utilizam o `checkRateLimit` (como `fs-account-repair`, `processo-sync`, `publicacoes-freshsales`) não estão registrando seu consumo corretamente. 

O problema reside na configuração do cliente Supabase. Essas funções instanciam o cliente apontando para o schema `judiciario` (`createClient(URL, KEY, { db: { schema: 'judiciario' } })`). No entanto, as funções RPC `fs_rate_limit_check` e `fs_rate_limit_consume` existem apenas no schema `public`. Como resultado, a chamada RPC falha silenciosamente, ativando o fallback da função que retorna `ok: true` sem registrar o consumo na tabela `freshsales_rate_limit`.

Isso explica por que a tabela de rate limit registra apenas 120 chamadas por hora (todas da função `datajud-andamentos-sync`), enquanto o Freshsales bloqueia requisições com o erro `HTTP 429 Too Many Requests`.

### 1.3. Sobrealocação de Quotas
O módulo `_shared/rate-limit.ts` define quotas por chamador que, somadas, ultrapassam o limite global. A soma das quotas atuais é de 1.290 chamadas/hora, enquanto o limite global configurado é de 990 chamadas/hora. Se todas as funções operarem em sua capacidade máxima simultaneamente (o que ocorre frequentemente de madrugada durante o processamento em lote), o rate limit do Freshsales será inevitavelmente violado.

## 2. Erros Recorrentes e Falhas de Autenticação

A análise do log de respostas HTTP (`net._http_response`) revelou erros sistemáticos que degradam a performance do sistema.

### 2.1. Erro 401: Invalid JWT Format
A cada 15 minutos, a função `freshdesk-cnj-detector` falha com o erro `UNAUTHORIZED_INVALID_JWT_FORMAT`. O CRON que aciona esta função está configurado com um token Bearer incompleto (apenas o cabeçalho do JWT, sem payload e assinatura). Isso gera falhas contínuas e polui os logs do sistema.

### 2.2. Erro 500: Advise API
A função `advise-ai-enricher-cron` (acionada a cada 10 minutos) falha sistematicamente com o erro: *"Os parâmetros de DataMovimento devem ser informados caso o parâmetro Lidos seja igual a 1 ou nulo"*. Isso indica que a integração com a API do Advise está enviando requisições malformadas.

### 2.3. Erro de Lógica no Billing Sync
A função `billing-deals-sync` reporta 15 erros a cada execução horária (`{"processados":15,"deals_criados":0,"erros":15}`). Isso resulta em 360 tentativas falhas diárias de criação de deals no Freshsales.

## 3. Progresso das Filas de Orquestração

Apesar dos problemas de rate limit, o orquestrador está funcional e drenando ativamente as filas de pendências. A comparação entre o estado inicial e o atual demonstra um progresso tangível.

| Fila (Entidade: Ação) | Pendências Iniciais | Pendências Atuais | Progresso |
|---|---|---|---|
| `processos:create_account` | 5.777 | 3.234 | **2.543 processados** |
| `movimentos:sync_activity` | 17.253 | 17.253 | Aguardando cota/prioridade |
| `publicacoes:sync_activity` | 11.215 | 11.215 | Aguardando cota/prioridade |
| `partes:create_contact` | 5.027 | 5.027 | Aguardando cota/prioridade |
| `prazos:create_task` | 2.942 | 2.942 | Erro de mapeamento de ação |

**Observação sobre a fila de prazos:** O orquestrador está acionando a função `publicacoes-prazos` com a ação `calcular_batch`, mas a fila espera a execução da ação `create_task`. Isso faz com que a função retorne "Todas as publicações do lote já têm prazo calculado" sem efetivamente criar as tarefas no Freshsales.

## 4. Recomendações de Correção

Para estabilizar o sistema e eliminar as violações de rate limit, recomendo as seguintes ações imediatas:

1. **Correção do Schema de Rate Limit:** Modificar todas as funções que utilizam o `checkRateLimit` para instanciar um cliente Supabase secundário apontando para o schema `public` ao invocar as funções RPC de controle de cota.
2. **Inclusão de Funções Autônomas no Controle:** Implementar o uso do `checkRateLimit` nas funções `fs-repair-orphans`, `billing-deals-sync`, `fs-contacts-sync` e `fs-tag-leilao`.
3. **Rebalanceamento de Quotas:** Ajustar as quotas no arquivo `_shared/rate-limit.ts` para que a soma total não ultrapasse 990 chamadas/hora.
4. **Correção de Tokens e Parâmetros:** Atualizar o token JWT no CRON `freshdesk-cnj-detector` e corrigir os parâmetros de requisição na integração com o Advise.
5. **Ajuste do Orquestrador:** Modificar o mapeamento da fila `prazos:create_task` no `orchestrator-engine` para acionar a ação correta.
