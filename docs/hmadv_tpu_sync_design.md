# HMADV - Design da `tpu-sync`

## Objetivo

Criar uma Edge Function oficial para:

- sincronizar classes, assuntos e movimentos da TPU
- usar Gateway TPU quando disponivel
- cair para SGT SOAP/WSDL como fallback
- resolver codigo CNJ ausente localmente durante o processamento de movimentos

## Responsabilidades da function

Nome sugerido:

- `tpu-sync`

Actions sugeridas:

- `status`
- `sync_movimentos`
- `sync_classes`
- `sync_assuntos`
- `sync_all`
- `resolver_movimento`
- `resolver_lote_movimentos`
- `enriquecer_processo`

## Fluxo principal

### 1. sync_all

1. consulta versao remota
2. sincroniza:
   - assuntos
   - classes
   - movimentos
3. registra log em `tpu_sync_log`

### 2. resolver_movimento

Entrada:

- `codigo_cnj`

Passos:

1. procura em `judiciario.tpu_movimento`
2. se nao encontrar:
   - consulta online no Gateway TPU
   - fallback para SGT SOAP
3. faz upsert local
4. devolve `movimento_tpu_id`

### 3. resolver_lote_movimentos

Entrada:

- limite

Passos:

1. busca `judiciario.movimentos` com `movimento_tpu_id is null`
2. resolve por codigo
3. atualiza:
   - `movimento_tpu_id`
   - `tpu_status`
   - `tpu_resolvido_em`

## Fontes externas

### Gateway TPU

Uso preferencial:

- endpoint mais estruturado
- melhor para consulta e paginação

### SGT SOAP/WSDL

Fallback obrigatorio:

- quando Gateway falhar
- quando codigo especifico nao vier do endpoint moderno

## Entidades impactadas

- `judiciario.tpu_movimento`
- `judiciario.tpu_classe`
- `judiciario.tpu_assunto`
- `judiciario.movimentos`
- `judiciario.tpu_sync_log`

## Regras de persistencia

- upsert por `codigo_cnj`
- nunca duplicar codigo
- registrar:
  - fonte (`gateway` ou `sgt`)
  - versao remota
  - horario de importacao

## Logs minimos

Em `tpu_sync_log`:

- `fonte`
- `tipo_tpu`
- `versao_cnj`
- `total_registros`
- `inseridos`
- `atualizados`
- `erros`
- `status`
- `erro`
- `iniciado_em`
- `concluido_em`

## Integracao com HMADV atual

### `datajud-search`

Ao persistir movimentos:

- salva `codigo`
- tenta localizar `movimento_tpu_id`
- se nao localizar:
  - marca `tpu_status='pendente'`

### `sync-worker`

Antes de exportar movimento:

- se `movimento_tpu_id` estiver nulo e `codigo` existir:
  - pode tentar `resolver_lote_movimentos`
  - ou exportar com descricao original quando necessario

## Criterio de pronto

- movimento novo com codigo CNJ consegue resolver TPU automaticamente
- backlog de movimentos sem TPU cai continuamente
- sincronizacao full da TPU pode ser rodada por cron
