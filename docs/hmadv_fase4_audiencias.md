# HMADV - Fase 4: Audiências

## Objetivo

Detectar audiências a partir de:

- movimentos do DataJud;
- publicações do Advise;

e preparar a exportação ao Freshsales como `Activities > Audiências`.

## Estado atual

O repositório ainda não possui uma trilha fechada de audiências.
Por isso, esta fase começa com:

1. schema próprio;
2. auditoria das candidatas;
3. só depois exportação ao Freshsales.

## Schema preparado

- [hmadv_fase4_audiencias_schema.sql](/D:/Github/newgit/docs/hmadv_fase4_audiencias_schema.sql)

Ele cria:

- `judiciario.audiencias`

Campos principais:

- `processo_id`
- `origem`
- `origem_id`
- `tipo`
- `data_audiencia`
- `descricao`
- `local`
- `situacao`
- `freshsales_activity_id`

## Script operacional

- [hmadv_reconciliar_audiencias.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_audiencias.ps1)

### Auditoria inicial

```powershell
$env:HMADV_SERVICE_ROLE="SEU_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_audiencias.ps1"
```

Esse script:

- lê movimentos e publicações com `processo_id`;
- procura termos como `audiência`, `sessão de julgamento`, `praça`, `hasta pública`;
- devolve amostra das candidatas.

## Critério de aceite da Fase 4

1. `judiciario.audiencias` criada no banco;
2. candidatas auditadas com taxa aceitável de falso positivo;
3. definição do `sales_activity_type_id` de Audiências no Freshsales;
4. depois disso, implementar exportação idempotente pelo `sync-worker`.

## Próximo passo após esta fase

Quando o inventário de audiências estiver validado:

1. persistir candidatas em `judiciario.audiencias`;
2. exportar só `situacao='detectada'` e `freshsales_activity_id is null`;
3. atualizar account com próxima audiência, quando aplicável.
