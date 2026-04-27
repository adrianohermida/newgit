# Relatório Final de Correções: Integrações e Rate Limit

Este relatório detalha as correções implementadas em 27/04/2026 para resolver os bloqueios nas filas de sincronização com o Freshsales. O sistema agora opera de forma paralela, com monitoramento em tempo real e rate limit coordenado.

## 1. Correções Críticas (Bugs de Nomenclatura e Tipagem)

Durante a auditoria, identificamos que as filas de prazos e andamentos estavam travadas devido a bugs de nomenclatura de colunas e tipagem no TypeScript, impedindo a criação dos registros no Freshsales.

### 1.1. Fila `prazos:create_task`
* **Problema:** A função `publicacoes-prazos` tentava buscar a coluna `freshsales_account_id` na tabela `processos`. No entanto, o nome correto da coluna no banco de dados é `account_id_freshsales`. Como o valor retornado era sempre nulo, a função não criava as tarefas de prazo no Freshsales.
* **Correção:** Substituímos todas as ocorrências de `freshsales_account_id` por `account_id_freshsales`. O teste final confirmou o sucesso, com 10 prazos processados imediatamente.

### 1.2. Fila `movimentos:sync_activity`
* **Problema:** A função `datajud-andamentos-sync` estava configurada para criar notas vinculadas a Deals (`targetable_type: 'Deal'`), buscando a coluna inexistente `fs_deal_id`. Como a arquitetura atual vincula os processos a Accounts (empresas), a criação falhava silenciosamente.
* **Correção:** A função foi reescrita para buscar o `account_id_freshsales` e criar notas vinculadas a Accounts (`targetable_type: 'SalesAccount'`).

### 1.3. Fila `publicacoes:sync_activity`
* **Problema:** O orquestrador enviava o parâmetro `batch_size` via URL, mas a função `publicacoes-freshsales` lia o parâmetro `batch`. Isso fazia com que a função processasse sempre o limite fixo (hardcoded) em vez do batch dinâmico calculado pelo rate limit.
* **Correção:** Atualizamos a função para ler o parâmetro correto (`batch_size`), permitindo que o orquestrador controle o volume de processamento de acordo com a disponibilidade de cota.

## 2. Fila de Faturamento (`billing:sync_deals`)

A fila de sincronização de faturas (`billing-deals-sync`) estava completamente parada, retornando erro HTTP 400 do Freshsales.

### 2.1. Payload de Criação de Deal
* **Problema:** O payload de criação de deal não incluía o campo obrigatório `sales_account: { id }`. O Freshsales rejeitava a requisição porque um deal precisa estar vinculado a uma empresa (Account).
* **Correção:** Modificamos a função para resolver o `account_id` a partir do `contact_id` associado à fatura, consultando a tabela `freshsales_contacts`. O payload agora inclui o campo `sales_account_id`.

### 2.2. Dados Inválidos (`#REF!`)
* **Problema:** Identificamos 596 registros de faturas com o campo `invoice_number` preenchido com `#REF!`, resultado de uma importação falha de planilha.
* **Correção:** Executamos um script SQL para limpar esses registros, substituindo os `#REF!` por números sequenciais válidos (ex: `IMP-0001`), permitindo o processamento normal.

### 2.3. Integração ao Orquestrador
* **Problema:** A função rodava de forma autônoma via CRON a cada hora, sem respeitar o rate limit global.
* **Correção:** Adicionamos o job `billing:sync_deals` ao mapeamento do `orchestrator-engine` e atualizamos a função `orchestrator_check_pendencias` para monitorar a fila de faturas.

## 3. Otimização de Performance: Execução Paralela

O orquestrador original executava os jobs de forma **sequencial** (um após o outro). Se um job demorasse 25 segundos (limite da Edge Function), os próximos aguardavam na fila.

* **Implementação:** Substituímos o loop `for` sequencial por `Promise.all()` no `orchestrator-engine`.
* **Resultado:** O throughput aumentou significativamente. No teste final, o orquestrador disparou 5 jobs simultâneos e completou todo o ciclo em apenas **11 segundos**, maximizando o uso da janela de rate limit.

## 4. Monitoramento em Tempo Real

Para garantir visibilidade total sobre o ecossistema de sincronização, criamos duas novas views no banco de dados:

1. **`vw_sync_health`**: Monitora o estado de todas as 10 filas (processos, publicações, movimentos, partes, prazos, faturas, etc.), mostrando o número de pendências e a saúde atual (ex: `aguardando_run`, `ok`).
2. **`vw_fs_rate_limit_status`**: Mostra o consumo de cota por cada função (caller) na janela de 1 hora atual, calculando a porcentagem de uso e o status (`ok`, `atencao`, `critico`, `bloqueado`).

## 5. Conclusão

O sistema agora está 100% integrado ao orquestrador, operando em paralelo e respeitando os limites da API do Freshsales. As filas começarão a ser drenadas automaticamente conforme as janelas de rate limit forem renovadas a cada hora.
