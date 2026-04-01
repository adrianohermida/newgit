# HMADV - Contatos Relacionados, Polos e Status Processual

## Objetivo

Garantir que todo `Sales Account` do Freshsales correspondente a processo judicial tenha:

- contatos relacionados corretamente vinculados
- identificação de quem é o cliente do Dr. Adriano Menezes Hermida Maia
- polos ativo e passivo corretamente preenchidos
- status processual consistente:
  - `Ativo`
  - `Baixado`
  - `Suspenso`

## Premissas

- o `Sales Account` representa o processo
- os `Contacts` representam pessoas físicas ou jurídicas ligadas ao processo
- a vinculação de cliente não pode depender só do DataJud
- a fonte principal dos polos e da representação deve ser a publicação, com apoio de partes já consolidadas e dados auxiliares do processo

## Fontes de verdade

### Publicações

Fonte prioritária para:

- `polo_ativo`
- `polo_passivo`
- identificação da parte representada pelo escritório
- extração de qualificadores como:
  - autor
  - requerente
  - exequente
  - agravante
  - réu
  - requerido
  - executado
  - agravado

### Partes consolidadas

Usar `judiciario.partes` como camada persistida e reconciliada para:

- nomes canônicos
- deduplicação
- polo
- advogados associados
- OAB
- marcador de representação pelo escritório

### Movimentos e publicações para status

O status do processo deve ser inferido por prioridade:

1. movimentos oficiais de baixa, arquivamento, suspensão ou cancelamento
2. publicações que indiquem suspensão, baixa ou arquivamento
3. fallback:
   - se não houver sinal de baixa/suspensão/cancelamento, considerar `Ativo`

## Regras de negócio

### Quem é o cliente do Dr. Adriano

Um contato deve ser marcado como cliente principal do processo quando:

- a publicação indicar explicitamente que a parte está representada por Adriano ou pelo escritório
- houver vínculo com advogado do escritório em `partes`
- houver histórico consistente de publicações onde a parte apareça como representada pela banca

### Critério operacional

Criar em `judiciario.partes` e/ou estrutura auxiliar:

- `representada_pelo_escritorio`
- `cliente_hmadv`
- `contato_freshsales_id`

Se mais de uma parte estiver representada:

- manter múltiplos contatos relacionados ao account
- definir um `cliente_principal` quando houver evidência forte
- caso contrário, marcar para triagem ou usar regra de prioridade por tipo de parte

### Polos

Regras:

- `polo_ativo` e `polo_passivo` devem ser recalculados a partir das publicações
- fallback para dados já persistidos no processo quando não houver extração nova
- no Freshsales:
  - `cf_polo_ativo`
  - `cf_parte_adversa`

### Status processual

Detectar em movimentos TPU/DataJud e em publicações termos como:

- baixa
- arquivado
- arquivamento definitivo
- extinto
- cancelado
- suspensão
- suspenso
- sobrestado

Mapeamento:

- `Baixado`
  - baixa, arquivamento definitivo, extinção com encerramento, cancelamento processual
- `Suspenso`
  - suspensão, sobrestamento, suspensão por convenção, suspensão por prazo legal
- `Ativo`
  - ausência de sinal de baixa ou suspensão

## Modelo de dados proposto

### Processo

Adicionar ou consolidar em `judiciario.processos`:

- `status_atual_processo`
- `status_fonte`
- `status_detectado_em`
- `status_evento_origem`

### Partes

Consolidar em `judiciario.partes`:

- `nome`
- `polo`
- `tipo_parte`
- `representada_pelo_escritorio`
- `cliente_hmadv`
- `contato_freshsales_id`
- `principal_no_account`

### Relacionamento com Freshsales

Criar trilha de reconciliação:

- `judiciario.processo_contato_sync`
  - `processo_id`
  - `parte_id`
  - `contact_id_freshsales`
  - `relacao`
  - `principal`
  - `synced_at`

## Fases

### Fase CS1 - Cliente e contatos

- definir regra determinística para identificar a parte cliente do escritório
- reconciliar partes com `Contacts` do Freshsales
- criar/vincular contatos faltantes
- garantir que todo process `Sales Account` tenha os contatos corretos relacionados

### Fase CS2 - Polos

- recalcular polos a partir de publicações
- persistir em `judiciario.processos`
- sincronizar para `cf_polo_ativo` e `cf_parte_adversa`

### Fase CS3 - Status processual

- detectar status a partir de movimentos
- complementar por publicação
- atualizar `status_atual_processo`
- sincronizar `cf_status`

### Fase CS4 - Auditoria e IA

- usar IA para:
  - reforçar classificação do cliente principal
  - explicar porque uma parte foi classificada como cliente
  - resumir mudança de status
  - detectar inconsistência entre status, movimento e publicação

## Critérios de aceite

- todo `Sales Account` do Freshsales tem contatos relacionados consistentes
- o cliente principal do processo é identificável
- polos ativo e passivo estão preenchidos e auditáveis
- `cf_status` reflete:
  - `Ativo`
  - `Baixado`
  - `Suspenso`
- se não houver movimento/publicação de baixa ou suspensão, o processo permanece `Ativo`

## Relação com o rollout atual

Sem pular etapas:

1. aplicar grant de `audiencias`
2. homologar `Audiências + Consulta + Appointment`
3. iniciar frente `Contacts + Polos + Status`
4. depois iniciar `Prazos Processuais`
