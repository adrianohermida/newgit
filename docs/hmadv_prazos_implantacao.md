# HMADV - Plano de Implantação de Prazos Processuais

## Objetivo

Adicionar ao HMADV uma camada completa de cálculo e automação de prazos processuais, integrada ao fluxo `DataJud + Advise + Freshsales`, com:

- biblioteca normativa de prazos por rito e base legal
- calendário unificado de feriados nacionais, estaduais e municipais
- controle de calendários forenses, suspensões de expediente, pontos facultativos e atos de presidência
- cálculo automático de vencimentos e marcos processuais
- geração de `Tasks` no Freshsales associadas ao `Sales Account` do processo
- uso de IA para interpretar publicações, audiências e eventos processuais, gerar descrições e sugerir prioridade/estratégia

## Anexos analisados

### Tabelas normativas

- [prazos_processuais_cpc_rows.csv](D:/Downloads/prazos_processuais_cpc_rows.csv)
- [prazos_processuais_penais_rows.csv](D:/Downloads/prazos_processuais_penais_rows.csv)
- [prazos_processuais_trabalhistas_rows.csv](D:/Downloads/prazos_processuais_trabalhistas_rows.csv)
- [prazos_processuais_juizados_rows.csv](D:/Downloads/prazos_processuais_juizados_rows.csv)

Estrutura observada:

- `ato_praticado`
- `prazo`
- `artigo`
- `base_legal`

### Calendário e jurisdição

- [Feriado_export (1).csv](D:/Downloads/Feriado_export%20(1).csv)
- [Estado_export (3).csv](D:/Downloads/Estado_export%20(3).csv)
- [Municipio_export (1).csv](D:/Downloads/Municipio_export%20(1).csv)
- [AdviseData - DJE.csv](D:/Downloads/AdviseData%20-%20DJE.csv)

Estrutura observada:

- feriados com `type`, `state`, `city`, `recurring`
- estados com `codigo_uf`, `sigla`
- municípios com `codigo`, `codigo_uf`
- mapa Advise de `Estado -> Diário -> Tribunais Abrangidos`

### Código de referência

- [calcularPrazo.ts](D:/Downloads/lawdesk455cc586%20(1)/functions/calcularPrazo.ts)
- [calcularPrazosEmMassa.ts](D:/Downloads/lawdesk455cc586%20(1)/functions/calcularPrazosEmMassa.ts)
- [calcularDiasUteisComFeriados.ts](D:/Downloads/lawdesk-crm-stance-main%20(2)/lawdesk-crm-stance-main/functions/calcularDiasUteisComFeriados.ts)
- [calcularPrazo.ts](D:/Downloads/lawdesk-crm-stance-main%20(2)/lawdesk-crm-stance-main/functions/calcularPrazo.ts)
- [calcularPrazosEmMassa.ts](D:/Downloads/lawdesk-crm-stance-main%20(2)/lawdesk-crm-stance-main/functions/calcularPrazosEmMassa.ts)
- [CalculadoraPrazosModal.jsx](D:/Downloads/lawdesk-crm-copy-5e839e4f%20(1)/src/components/prazos/CalculadoraPrazosModal.jsx)
- [prazos.zip](D:/Downloads/tpu/prazos.zip)

Padrões aproveitáveis:

- cache de feriados e suspensões
- cálculo unitário e em massa
- detecção por palavra-chave de prazo, audiência e diligência
- integração entre regra normativa e evento processual

## Modelo de dados proposto no HMADV

### Núcleo normativo

- `judiciario.prazo_regra`
  - `id`
  - `ato_praticado`
  - `base_legal`
  - `artigo`
  - `prazo_texto_original`
  - `prazo_dias`
  - `tipo_contagem`
  - `ramo`
  - `rito`
  - `instancia`
  - `tribunal_sigla`
  - `aplica_ia`
  - `ativo`
  - `metadata`

- `judiciario.prazo_regra_alias`
  - sinônimos, verbos e gatilhos textuais para matching IA/lógico

### Calendário

- `judiciario.estado_ibge`
- `judiciario.municipio_ibge`
- `judiciario.feriado_forense`
  - nacional, estadual, municipal, tribunal, ponto facultativo
- `judiciario.suspensao_expediente`
  - atos de presidência, provimentos, portarias, indisponibilidade
- `judiciario.calendario_forense_fonte`
  - rastreia origem e vigência do ato

### Cálculo e automação

- `judiciario.prazo_calculado`
  - processo, publicação, movimento ou audiência origem
  - regra aplicada
  - data base
  - data início da contagem
  - data vencimento
  - status
  - prioridade
  - observações IA
  - `freshsales_task_id`

- `judiciario.prazo_evento`
  - histórico de recalculo, suspensão, reabertura, cumprimento, perda

## Fontes e inteligência de cálculo

### Regra normativa

Usar os CSVs anexos como carga inicial oficial para:

- CPC
- Penal
- Trabalhista
- Juizados

### Contexto jurisdicional

Inferir e consolidar:

- tribunal
- instância
- comarca
- município
- estado
- diário
- sistema
- natureza processual

### Calendário ativo

O cálculo precisa considerar cumulativamente:

- feriados nacionais
- feriados estaduais
- feriados municipais
- feriados do tribunal
- suspensão de expediente
- suspensão de prazo
- ponto facultativo com impacto processual
- ato de presidência
- calendário forense anual
- indisponibilidade de sistema com impacto em prazo

### Eventos disparadores

Gerar ou recalcular prazos a partir de:

- publicações
- movimentos
- audiências
- alterações de fase/status
- novas intimações

## Lógica de automação

### Prazos por regra

1. Detectar o evento processual relevante.
2. Encontrar a melhor `prazo_regra` por matching:
   - código TPU
   - descrição do movimento
   - publicação
   - tribunal/rito/ramo
3. Definir data base:
   - disponibilização
   - publicação
   - intimação presumida
   - data da audiência
4. Aplicar calendário forense.
5. Criar `prazo_calculado`.
6. Criar `Task` no Freshsales vinculada ao account do processo.

### Tarefas no Freshsales

O módulo de `Tasks` deve receber:

- título objetivo do prazo
- descrição rica gerada por IA
- vencimento
- prioridade
- referência legal
- referência ao evento de origem
- sugestão de providência

### Audiências

Quando houver audiência futura:

- criar activity em `Audiências`
- criar `Appointment/Reunião`
- gerar também task preparatória se houver providência prévia

## Uso de IA

### IA para interpretação

O worker IA deve:

- ler publicação, movimento e audiência
- classificar o tipo de evento
- identificar risco processual
- detectar inconsistência entre evento e status do processo
- sugerir fase e prioridade
- montar descrição da task
- montar anotação em `Consulta`

### IA para prazo

A IA não substitui a regra normativa. Ela deve:

- sugerir a melhor regra candidata
- explicar a escolha
- preencher resumo operacional
- sinalizar casos ambíguos para triagem

### Princípio

- cálculo final = lógica determinística + calendário validado
- IA = classificação, enriquecimento, descrição e fallback assistido

## Fases de implementação

### Fase PZ1 - Schema e carga base

- criar tabelas:
  - `prazo_regra`
  - `prazo_regra_alias`
  - `estado_ibge`
  - `municipio_ibge`
  - `feriado_forense`
  - `suspensao_expediente`
  - `calendario_forense_fonte`
  - `prazo_calculado`
  - `prazo_evento`
- importar:
  - estados
  - municípios
  - feriados
  - regras normativas
  - mapa Advise de diários

### Fase PZ2 - Engine determinística

- portar a lógica de:
  - [calcularPrazo.ts](D:/Downloads/lawdesk455cc586%20(1)/functions/calcularPrazo.ts)
  - [calcularPrazosEmMassa.ts](D:/Downloads/lawdesk455cc586%20(1)/functions/calcularPrazosEmMassa.ts)
  - [calcularDiasUteisComFeriados.ts](D:/Downloads/lawdesk-crm-stance-main%20(2)/lawdesk-crm-stance-main/functions/calcularDiasUteisComFeriados.ts)
- criar edge functions no HMADV:
  - `prazo-calc`
  - `prazo-recalc`
  - `prazo-worker`

### Fase PZ3 - Integração com publicações e movimentos

- ligar `sync-worker` e `advise-sync` à detecção de prazo
- ligar `tpu-sync` aos gatilhos de prazo por movimento
- gerar `prazo_calculado` automaticamente

### Fase PZ4 - Freshsales Tasks

- criar/exportar task no Freshsales para cada prazo elegível
- manter idempotência por `freshsales_task_id`
- atualizar task quando houver recálculo, suspensão ou cumprimento

### Fase PZ5 - IA operacional

- usar o worker Cloudflare IA para:
  - classificar evento
  - sugerir regra
  - preencher descrição da task
  - gerar observação de risco
  - sinalizar urgência e inconsistência

### Fase PZ6 - Calendário forense avançado

- incorporar atos de presidência
- incorporar suspensões extraordinárias
- incorporar pontos facultativos com impacto processual
- versionar vigência por tribunal/comarca

## Critérios de aceite

- regras normativas importadas e consultáveis
- feriados e malha territorial carregados
- cálculo reprodutível para CPC, Penal, Trabalhista e Juizados
- publicações e movimentos relevantes geram prazos automaticamente
- task criada no Freshsales para prazo aplicável
- IA preenche descrição e contexto da task
- audiências futuras geram appointment e task preparatória quando aplicável
- recálculo respeita suspensão/feriado/ato superveniente

## Relação com o plano anterior

Esta frente entra depois do bloco atual sem pular etapas:

1. destravar `judiciario.audiencias`
2. homologar `Audiências + Consulta + Appointment`
3. iniciar `PZ1`
4. seguir sequencialmente até `PZ6`
