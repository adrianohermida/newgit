# HMADV Workflow Aprimorado para Freshsales

## Objetivo

Garantir que o Freshsales seja atualizado em camadas:

1. o processo entra ou Ã© vinculado;
2. o DataJud enriquece o processo no Supabase;
3. o Sales Account recebe os campos estruturados corretos;
4. andamentos e publicaÃ§Ãµes sÃ£o exportados como activities.

## Fluxo recomendado

### 1. Entrada e enriquecimento judicial

- `fs-webhook`
  - recebe o processo vindo do Freshsales;
  - enfileira `fs_webhook_sync`.
- `datajud-worker`
  - consulta/persiste DataJud;
  - atualiza o processo no Supabase;
  - cria a activity de consulta.

### 2. ReparaÃ§Ã£o do Sales Account

- `fs-account-repair`
  - usa os campos reais do catÃ¡logo do Freshsales;
  - preenche tÃ­tulo, comarca, classe, nÃºmero do juÃ­zo, descriÃ§Ã£o do Ãºltimo movimento, diÃ¡rio e conteÃºdo da Ãºltima publicaÃ§Ã£o;
  - reaproveita partes, movimentos e publicaÃ§Ãµes jÃ¡ existentes no Supabase.

### 3. ExportaÃ§Ã£o operacional

- `sync-worker`
  - cria/vincula accounts pendentes;
  - sincroniza dados bidirecionais bÃ¡sicos;
  - exporta `movimentos` como activities;
  - exporta `publicacoes` como activities.

## Cron recomendado

### Frequente

- `datajud-worker`: a cada 5 minutos
- `sync-worker`: a cada 2 minutos

### CompletaÃ§Ã£o do Sales Account

Enquanto a chamada interna do `sync-worker -> fs-account-repair` nÃ£o estiver consolidada no runtime, rodar `fs-account-repair` como cron separado:

- `fs-account-repair?action=batch&limit=5&offset=0`
- repetir com offsets progressivos ou com janelas rotativas

SugestÃ£o prÃ¡tica:

- `fs-account-repair`: a cada 10 minutos, em lotes pequenos

## Prova jÃ¡ validada

No processo `0000204-50.2021.8.26.0441`, o fluxo corrigido jÃ¡ preencheu corretamente no Freshsales:

- `city`
- `cf_numero_do_juizo`
- `cf_classe`
- `cf_descricao_ultimo_movimento`
- `cf_DJ`
- `cf_publicacao_em`
- `cf_contedo_publicacao`

TambÃ©m jÃ¡ estava comprovado:

- `142` andamentos exportados
- `1` publicaÃ§Ã£o exportada

## Endpoint operacional

### Reparo unitÃ¡rio

- `fs-account-repair`

### Reparo em lote

- `fs-account-repair?action=batch&limit=N&offset=M`

## Leitura operacional

O workflow antigo atualizava o account de forma parcial e depois partia para timeline.
O workflow aprimorado insere uma etapa de completude do Sales Account antes da exportaÃ§Ã£o de andamentos/publicaÃ§Ãµes.

Isso melhora:

- qualidade dos detalhes do processo no Freshsales;
- consistÃªncia entre Supabase e CRM;
- rastreabilidade para o usuÃ¡rio final antes mesmo da timeline estar 100% drenada.

