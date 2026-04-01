# Zoom + Freshsales Suite + Jornada de Agendamento

## Objetivo
Transformar o fluxo de agendamento em uma jornada completa de CRM:

1. o cliente agenda
2. o sistema cria/atualiza sala virtual
3. o CRM registra a reunião como `appointment`
4. o contato avança de fase
5. confirmações, cancelamentos e remarcações atualizam o Freshsales
6. campanhas, sequências, jornadas e WhatsApp passam a reagir ao status real da reunião

## Arquitetura recomendada

- `Agendamento público`: continua no `newgit`
- `Google Calendar`: continua como fonte de disponibilidade
- `Zoom`: passa a ser o provedor de reunião virtual
- `Freshsales CRM`: vira o source of truth de jornada comercial
- `Freshsales Appointments`: espelha a reunião
- `Freshsales contact stages`: registram o momento do relacionamento
- `Freshsales campaigns / journeys / sequences`: automatizam follow-up e confirmação

## Fases de CRM a usar

### Fase de ciclo de vida
- Triagem
- Novo
- Conectado
- Retorno
- Pedido de retorno
- Visitante
- Fornecedor
- Não qualificado

### Reunião
- Agendamento
- Confirmação de presença
- Ausência
- Reagendamento
- Cancelamento de reunião

### Negociação
- Envio de Proposta
- Pendente de aceite
- Revisão de proposta
- Proposta Aceita
- Proposta Recusada

### Fechamento
- Envio de contrato
- Revisão de termos
- Pendente de assinatura
- Desistência

### Cliente
- Ativo
- Inativo

## Mapeamento recomendado do fluxo

### Ao agendar
- criar/atualizar `appointment` no Freshsales
- setar ciclo de vida para `Triagem`
- setar reunião para `Agendamento`
- gerar links de `confirmar`, `cancelar` e `remarcar`
- registrar `zoom_join_url`, `zoom_meeting_id` e `external_id` do agendamento

### Ao confirmar
- atualizar `appointment`
- setar ciclo de vida para `Conectado`
- setar reunião para `Confirmação de presença`
- disparar sequência ou jornada de preparação

### Ao remarcar
- atualizar horário do `appointment`
- atualizar reunião para `Reagendamento`
- reenviar confirmação

### Ao cancelar
- cancelar ou marcar cancelado no `appointment`
- atualizar reunião para `Cancelamento de reunião`
- acionar jornada de recuperação

### Após reunião
- se compareceu: avançar conforme qualificação
- se faltou: reunião = `Ausência`
- se houve interesse comercial: mover para `Negociação`

## Cobertura de integração a aumentar

### Zoom
- token server-to-server
- criar reunião
- atualizar reunião
- deletar reunião
- ler snapshot da sala
- listar participantes pós-reunião

### Freshsales
- `contacts`: localizar/upsert pelo e-mail
- `appointments`: criar/atualizar/cancelar
- `sales_activities`: registrar eventos auxiliares
- `contact custom fields`: refletir ciclo de vida e estágio da reunião
- `sequences`, `campaigns` e `journeys`: reagir ao status da reunião

## Links de ação no e-mail

Os links já existentes no projeto devem virar a ponte entre:

- site
- CRM
- meeting stage
- automação

### Confirmar
- rota do site confirma
- atualiza Supabase
- atualiza Freshsales
- opcionalmente registra presença confirmada

### Cancelar
- rota do site cancela
- apaga ou marca cancelado no Zoom
- atualiza Freshsales

### Remarcar
- rota do site remarca
- atualiza Zoom
- atualiza Freshsales

## Próxima implementação segura

1. ampliar a tabela `agendamentos` com campos de Zoom e CRM
2. criar helper de Zoom server-to-server
3. criar adapter Freshsales para `appointments`
4. conectar isso ao fluxo de `agendar`, `confirmar`, `cancelar` e `remarcar`
5. só depois ligar automações de sequência/jornada/campanha

## Risco a evitar

Não acoplar a automação comercial diretamente ao clique do usuário sem persistência intermediária. O fluxo deve ser:

`ação do cliente -> persistência local -> sync CRM -> automação Freshsales`

Assim o sistema continua íntegro mesmo se Zoom ou Freshsales estiverem temporariamente indisponíveis.
