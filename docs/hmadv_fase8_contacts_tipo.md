# HMADV - Contacts por Tipo no Freshsales

## Objetivo

Permitir criacao de `Contacts` no Freshsales usando apenas `nome`, com classificacao no campo `Tipo`.

## Regra de classificacao

### Cliente

Cadastrar como `Cliente` somente a parte que:

- aparece no polo representado pelo escritorio; e
- possui marcador forte do Dr. Adriano nas publicacoes:
  - `ADRIANO MENEZES HERMIDA MAIA`
  - `ADRIANO HERMIDA MAIA`
  - `HERMIDA MAIA`
  - `ADRIANO MENEZES`

### Parte Adversa

Cadastrar como `Parte Adversa` a pessoa fisica ou juridica que:

- aparece no polo oposto ao polo representado pelo escritorio; e
- integra o processo como parte ativa ou passiva adversa

### Demais partes

Na ausencia de classificacao mais forte, cadastrar como:

- `Terceiro Interessado`

## Opcoes aceitas no campo `Tipo`

- `Cliente`
- `Parte Adversa`
- `Advogado Adverso`
- `Correspondente`
- `Terceiro Interessado`
- `Prestador de Serviço`
- `Fornecedor`
- `Perito`
- `Juiz`
- `Promotor`
- `Desembargador`
- `Testemunha`

## Script operacional

- [hmadv_criar_contacts_relacionados.ps1](/D:/Github/newgit/docs/hmadv_criar_contacts_relacionados.ps1)

## Como o script trabalha

1. le processos com `account_id_freshsales`
2. busca `partes` e `publicacoes`
3. identifica o polo representado pelo escritorio
4. classifica:
   - `Cliente`
   - `Parte Adversa`
   - `Terceiro Interessado`
5. tenta criar ou atualizar contato no Freshsales com:
   - `first_name`
   - `last_name`
   - `external_id`
   - campo customizado `Tipo`
6. grava no HMADV:
   - `partes.contato_freshsales_id`
   - `partes.cliente_hmadv`
   - `partes.representada_pelo_escritorio`
   - `partes.principal_no_account`
   - `processo_contato_sync`

## Campo `Tipo`

O nome do campo e configuravel:

- parametro `-ContactTypeField`
- ou `env:FRESHSALES_CONTACT_TYPE_FIELD`

Valor padrao:

- `cf_tipo`

## Uso

### Dry-run

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
$env:FRESHSALES_API_BASE="https://hmadv-7b725ea101eff55.freshsales.io"
$env:FRESHSALES_API_KEY="SUA_FRESHSALES_API_KEY"

powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_criar_contacts_relacionados.ps1" -Limite 20
```

### Aplicacao real

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
$env:FRESHSALES_API_BASE="https://hmadv-7b725ea101eff55.freshsales.io"
$env:FRESHSALES_API_KEY="SUA_FRESHSALES_API_KEY"
$env:FRESHSALES_CONTACT_TYPE_FIELD="cf_tipo"

powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_criar_contacts_relacionados.ps1" -Aplicar -Limite 20
```

## Observacao importante

O tenant entrou em `429` durante a consulta de catalogo de campos do Freshsales.

Entao o script ficou preparado para o campo configuravel `Tipo`, mas a validacao final do nome exato do custom field no tenant deve ser refeita quando o rate limit baixar.
