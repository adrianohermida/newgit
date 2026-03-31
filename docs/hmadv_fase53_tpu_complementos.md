# HMADV - Fase 5.3: Complementos e Temporalidade da TPU

## Objetivo

Completar a carga da TPU nova do CNJ com a camada que faltava para movimentos:

- `tipo_complemento`
- `complemento`
- `complemento_movimento`
- `complemento_tabelado`
- `procedimento_complementos`
- `temporariedade`
- `tipo_ramo_justica`
- `temp_item`

Isso fecha a parte estrutural que o dump atualizado do CNJ traz alem de `classes`, `assuntos`, `movimentos` e `documentos`.

## Artefatos oficiais

- [hmadv_fase53_tpu_complementos_schema.sql](/D:/Github/newgit/docs/hmadv_fase53_tpu_complementos_schema.sql)
- [hmadv_import_tpu_complementos.ps1](/D:/Github/newgit/docs/hmadv_import_tpu_complementos.ps1)
- [hmadv_rodar_tpu_complementos.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_complementos.ps1)
- [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts)

## Ordem de rollout

1. aplicar [hmadv_fase53_tpu_complementos_schema.sql](/D:/Github/newgit/docs/hmadv_fase53_tpu_complementos_schema.sql)
2. rodar `dry-run`:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_rodar_tpu_complementos.ps1" -MaxRows 5
```

3. importar:

```powershell
$serviceRole = "SUA_SERVICE_ROLE"

powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_rodar_tpu_complementos.ps1" `
  -Importar `
  -ExecutarValidacaoFinal `
  -ServiceRole $serviceRole `
  -BatchSize 20
```

4. publicar no HMADV a versao nova da [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts)
5. validar `resolver_movimento` para codigos como `92`, `123`, `11010`, `11383`

## Resultado esperado

- o estoque TPU deixa de ser apenas basico;
- `resolver_movimento` passa a devolver tambem complementos conhecidos;
- o backlog historico de movimentos ganha mais contexto para classificacao futura;
- o SGT online fica restrito a fallback.
