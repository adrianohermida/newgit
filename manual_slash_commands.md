# Guia de Configuração dos Slash Commands do DotoBot no Slack

Este manual orienta a configuração dos comandos slash (`/`) no painel do Slack App para integrar com a edge function `dotobot-slack` do Supabase. O objetivo é permitir que você e sua equipe acionem funções do sistema HMADV diretamente do chat do Slack com autocomplete.

## Passo a Passo Inicial

1. Acesse o painel de apps do Slack: [https://api.slack.com/apps](https://api.slack.com/apps)
2. Clique no app **Dotobot** na lista de seus apps.
3. No menu lateral esquerdo, sob a seção "Features", clique em **Slash Commands**.
4. Clique no botão **Create New Command**.

A URL base para **todos os comandos** é a mesma da edge function `dotobot-slack`:
`https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack`

## Comandos a Serem Criados

Crie cada um dos comandos abaixo repetindo o processo "Create New Command". Para cada comando, preencha os campos exatamente como indicado:

### 1. Comando Principal do DotoBot
* **Command:** `/dotobot`
* **Request URL:** `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack`
* **Short Description:** Painel central do HMADV (status, publicações, audiências, pendências)
* **Usage Hint:** `[status | pendencias | publicacoes | audiencias | help]`

### 2. Comandos de Reparo e Correção
* **Command:** `/dotobot-repair`
* **Request URL:** `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack`
* **Short Description:** Corrige campos órfãos em processos (instância, fase, partes, status)
* **Usage Hint:** `[orphans | instancia | partes | status | fs_sync | all]`

### 3. Comandos do Freshsales
* **Command:** `/dotobot-fs`
* **Request URL:** `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack`
* **Short Description:** Aciona funções do Freshsales (activities, accounts)
* **Usage Hint:** `[fix_activities]`

### 4. Comandos do Backfill Advise
* **Command:** `/dotobot-advise`
* **Request URL:** `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack`
* **Short Description:** Aciona e monitora o backfill intensivo de publicações do Advise
* **Usage Hint:** `[backfill | backfill-status | drain_advise]`

### 5. Comandos do DataJud
* **Command:** `/dotobot-datajud`
* **Request URL:** `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack`
* **Short Description:** Gerencia a fila e status do DataJud
* **Usage Hint:** `[reset-datajud]`

## Configuração de Autenticação (Obrigatório)

Após criar os comandos, o Slack enviará as requisições para o Supabase usando o formato `application/x-www-form-urlencoded`. A edge function `dotobot-slack` já está programada para verificar o `SLACK_SIGNING_SECRET` para garantir que a requisição veio realmente do Slack.

**Importante:** Verifique se o secret `SLACK_SIGNING_SECRET` está configurado no Supabase.
1. No painel do Slack App, vá em **Basic Information**.
2. Role até a seção **App Credentials**.
3. Clique em **Show** ao lado de "Signing Secret" e copie o valor.
4. No terminal do Supabase CLI, adicione o secret:
   ```bash
   supabase secrets set SLACK_SIGNING_SECRET="valor_copiado_aqui"
   ```

## Como Usar no Slack

Após configurar os comandos, basta digitar `/dotobot` em qualquer canal onde o bot esteja presente. O Slack mostrará as opções com autocomplete. 

Exemplos de uso:
* `/dotobot status` - Mostra o painel completo do sistema
* `/dotobot publicacoes` - Lista as últimas 5 publicações
* `/dotobot-repair all` - Executa todas as correções de campos órfãos
* `/dotobot-advise backfill-status` - Mostra o progresso do backfill de 120 dias
