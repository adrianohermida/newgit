# HMADV - Fase 5.2: Rollout TPU / SGT

## Ordem segura

1. aplicar [hmadv_p1_tpu_schema.sql](/D:/Github/newgit/docs/hmadv_p1_tpu_schema.sql)
2. descobrir os dumps anuais reais com [hmadv_descobrir_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_descobrir_tpu_anual.ps1)
3. validar o formato com [hmadv_preview_tpu_sql.ps1](/D:/Github/newgit/docs/hmadv_preview_tpu_sql.ps1)
4. rodar `dry-run` via [hmadv_rodar_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_anual.ps1)
5. importar `classe`
6. importar `assunto`
7. importar `movimento`
8. importar `documento`
9. aplicar [hmadv_fase53_tpu_complementos_schema.sql](/D:/Github/newgit/docs/hmadv_fase53_tpu_complementos_schema.sql)
10. importar complementos e temporalidade com [hmadv_rodar_tpu_complementos.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_complementos.ps1)
11. validar a carga com [hmadv_fase5_tpu_validacao.ps1](/D:/Github/newgit/docs/hmadv_fase5_tpu_validacao.ps1)
12. publicar ou chamar [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts)
13. rodar `resolver_lote_movimentos`
14. medir a queda do backlog

## Comando correto

```powershell
$serviceRole = "SEU_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_rodar_tpu_anual.ps1" `
  -Importar `
  -ExecutarValidacaoFinal `
  -ServiceRole $serviceRole `
  -IncluirDocumentos
```

## Critério de aceite

- `tpu_classe` com carga anual
- `tpu_assunto` com carga anual
- `tpu_movimento` com carga anual
- `tpu_documento` com carga anual
- complementos e temporalidade carregados
- backlog de `movimentos` sem `movimento_tpu_id` começando a cair
- `tpu_status=resolvido` aparecendo em lote

## Automação local

- [hmadv_descobrir_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_descobrir_tpu_anual.ps1)
- [hmadv_preview_tpu_sql.ps1](/D:/Github/newgit/docs/hmadv_preview_tpu_sql.ps1)
- [hmadv_import_tpu_sql_itens.ps1](/D:/Github/newgit/docs/hmadv_import_tpu_sql_itens.ps1)
- [hmadv_rodar_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_anual.ps1)
- [hmadv_import_tpu_complementos.ps1](/D:/Github/newgit/docs/hmadv_import_tpu_complementos.ps1)
- [hmadv_rodar_tpu_complementos.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_complementos.ps1)
- [hmadv_fase5_tpu_validacao.ps1](/D:/Github/newgit/docs/hmadv_fase5_tpu_validacao.ps1)

## Dumps reais encontrados

Em `D:\Downloads\tpu`, os arquivos reais identificados para a carga anual foram:

- `classe_dump_dados_oracle_postgres.sql`
- `assunto_dump_dados_oracle_postgres.sql`
- `movimento_dump_dados_oracle_postgres.sql`
- `documento_dump_dados_oracle_postgres.sql`

## Se aparecer 42501 / permission denied

Aplique antes [hmadv_fase5_tpu_grants.sql](/D:/Github/newgit/docs/hmadv_fase5_tpu_grants.sql).

Esse grant destrava o acesso do `service_role` via PostgREST para:

- `judiciario.tpu_classe`
- `judiciario.tpu_assunto`
- `judiciario.tpu_movimento`
- `judiciario.tpu_documento`
- tabelas `tpu_*` de complementos/temporalidade da fase 5.3
- `judiciario.tpu_sync_log`
- leitura/atualizacao de `judiciario.movimentos`

