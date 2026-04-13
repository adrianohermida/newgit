# HMADV Market Ads

## Objetivo

Este pacote concentra a interface e a orquestracao do modulo `HMADV Market Ads`.
O objetivo da organizacao atual e manter:

- paginas pequenas
- componentes visuais curtos
- hooks separados por dominio
- navegacao simples para manutencao futura

## Estrutura

- `MarketAdsPage.js`
  pagina compositora do modulo
- `SummarySection.js`
  cards de resumo, status e pilares
- `IntegrationsSection.js`
  shell da area de integracoes
- `FormsWorkspaceSection.js`
  shell dos formularios operacionais
- `OperationsInsightsPanel.js`
  shell da coluna operacional e analitica
- `CompetitorInsightsPanel.js`
  concorrencia e benchmark

## Hooks

- `useMarketAdsController.js`
  orquestra os hooks menores e entrega a API consumida pela pagina
- `useMarketAdsForms.js`
  estado local e resets de formularios
- `useMarketAdsCreativeActions.js`
  geracao, drafts, compliance, atribuicao e templates
- `useMarketAdsCrudActions.js`
  CRUD de campanhas, anuncios, testes e recomendacao de landing
- `useMarketAdsIntegrationActions.js`
  leitura, importacao e otimizacao operacional
- `useMarketAdsDerivedData.js`
  derivados de leitura, filas e snapshot
- `useMarketAdsTemplateActions.js`
  operacoes especificas da biblioteca de templates

## Subpastas

- `integrations/`
  cards e blocos remotos de Google Ads e Meta Ads
- `operations/`
  cards menores da coluna operacional

## Regra pratica

Ao evoluir o modulo:

1. prefira criar um novo card ou hook antes de crescer um arquivo existente
2. mantenha a pagina como composicao, nao como implementacao
3. concentre efeitos colaterais em hooks de dominio
4. use `shared.js` apenas para utilitarios realmente compartilhados
