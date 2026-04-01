# HMADV - Regras Operacionais da Fase 8

## Objetivo

Definir regras deterministicas para:

- identificar quem e o cliente do escritorio em cada processo;
- preencher `polo_ativo` e `polo_passivo`;
- classificar `status_atual_processo`;
- refletir isso no Supabase e no Freshsales.

## Ordem de prioridade

1. publicacoes
2. partes persistidas em `judiciario.partes`
3. movimentos
4. titulo do processo no Freshsales como ultimo fallback auditavel

## Cliente do escritorio

Um registro em `judiciario.partes` deve ser marcado como `representada_pelo_escritorio = true` quando houver ao menos um destes sinais:

- publicacao com a parte seguida de advogado do escritorio;
- publicacao com expressao de representacao associada ao escritorio;
- parte consolidada com advogado/OAB associado ao escritorio;
- contato ja vinculado ao account e reaparecendo como parte representada em novas publicacoes.

Um registro em `judiciario.partes` deve ser marcado como `cliente_hmadv = true` quando:

- for parte representada pelo escritorio; e
- nao houver evidencia mais forte de que se trata apenas de terceiro interessado.

## Cliente principal do processo

Marcar `principal_no_account = true` quando houver evidencia forte:

- unica parte representada pelo escritorio no processo;
- maior recorrencia nas publicacoes como parte patrocinada;
- coincidencia com contact ja principal no Freshsales;
- coincidencia com `polo_ativo` em processos de cobranca/execucao patrocinados pela banca.

Se houver mais de uma parte representada e sem criterio forte, manter varias relacionadas e nao forcar principal.

## Polos

### Polo ativo

Sinais positivos:

- `autor`
- `requerente`
- `exequente`
- `agravante`
- `impetrante`
- `recorrente`
- `embargante`

### Polo passivo

Sinais positivos:

- `reu`
- `requerido`
- `executado`
- `agravado`
- `impetrado`
- `recorrido`
- `embargado`

### Regra de consolidacao

- usar a publicacao mais recente com indicacao explicita de polo;
- consolidar nomes canonicos em `judiciario.partes`;
- persistir em `judiciario.processos.polo_ativo` e `judiciario.processos.polo_passivo`;
- sincronizar no Freshsales:
  - `cf_polo_ativo`
  - `cf_parte_adversa`

## Status processual

### Baixado

Classificar como `Baixado` quando houver movimento ou publicacao com sinal forte de encerramento:

- `baixado`
- `baixa definitiva`
- `arquivado`
- `arquivamento definitivo`
- `cancelado`
- `extinto`
- `extincao do processo`
- `transitado em julgado e arquivado`

### Suspenso

Classificar como `Suspenso` quando houver sinal forte de interrupcao:

- `suspenso`
- `suspensao`
- `sobrestado`
- `sobrestamento`
- `suspensao do processo`
- `suspensao do prazo`

### Ativo

Classificar como `Ativo` quando:

- nao houver sinal forte de `Baixado`; e
- nao houver sinal forte de `Suspenso`.

## Fonte e auditoria

Persistir junto do status:

- `status_fonte`
- `status_detectado_em`
- `status_evento_origem`

Valores esperados para `status_fonte`:

- `movimento`
- `publicacao`
- `fallback`

## Reflexo no Freshsales

Cada processo com `account_id_freshsales` deve convergir para:

- contatos relacionados corretos;
- cliente principal quando houver evidencia forte;
- `cf_polo_ativo` preenchido;
- `cf_parte_adversa` preenchido;
- `cf_status` restrito a:
  - `Ativo`
  - `Baixado`
  - `Suspenso`

## Criterio de aceite

- Supabase passa a ser a fonte canonica de polos e status;
- Freshsales reflete essa canonizacao;
- contatos do account passam a espelhar as partes representadas;
- processos sem sinal de baixa ou suspensao permanecem `Ativo`.
