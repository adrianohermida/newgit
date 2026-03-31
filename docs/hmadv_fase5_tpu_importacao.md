# HMADV - Fase 5.1: Carga anual da TPU

## Objetivo

Carregar `tpu_classe`, `tpu_assunto`, `tpu_movimento` e `tpu_documento` no schema `judiciario` a partir dos dumps anuais reais, sem depender do dashboard do Supabase.

## Caminho oficial

Os dumps reais encontrados em `D:\Downloads\tpu` usam `INSERT INTO ITENS (...) VALUES (...)` e diferenciam cada entidade por `tipo_item`:

- `C` para classes
- `A` para assuntos
- `M` para movimentos
- `D` para documentos

Por isso, o caminho oficial desta fase passa a ser:

- [hmadv_preview_tpu_sql.ps1](/D:/Github/newgit/docs/hmadv_preview_tpu_sql.ps1)
- [hmadv_import_tpu_sql_itens.ps1](/D:/Github/newgit/docs/hmadv_import_tpu_sql_itens.ps1)
- [hmadv_descobrir_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_descobrir_tpu_anual.ps1)
- [hmadv_rodar_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_anual.ps1)
- [hmadv_p1_tpu_schema.sql](/D:/Github/newgit/docs/hmadv_p1_tpu_schema.sql)

O script [hmadv_import_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_import_tpu_anual.ps1) fica apenas como legado de estudo. O fluxo operacional deve usar o importador `sql_itens`.

## Estratégia recomendada

1. descobrir os dumps anuais reais;
2. fazer preview rápido para confirmar o formato;
3. rodar `dry-run` em lotes pequenos;
4. importar `classe`, `assunto`, `movimento` e, se o schema já estiver aplicado, `documento`;
5. validar a carga local;
6. rodar [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts) para reduzir backlog histórico.

## Comando correto

No PowerShell, a `service_role` precisa estar no mesmo comando ou no ambiente antes da execução. Isto funciona:

```powershell
$serviceRole = "SEU_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_rodar_tpu_anual.ps1" `
  -Importar `
  -ExecutarValidacaoFinal `
  -ServiceRole $serviceRole `
  -IncluirDocumentos
```

Isto nao funciona:

```powershell
powershell -ExecutionPolicy Bypass -File "...hmadv_rodar_tpu_anual.ps1" -Importar -ExecutarValidacaoFinal$env:HMADV_SERVICE_ROLE="..."
```

## Exemplos

### Descobrir os arquivos anuais

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_descobrir_tpu_anual.ps1"
```

### Preview do dump real

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_preview_tpu_sql.ps1" `
  -InputPath "D:\Downloads\tpu\movimento_dump_dados_oracle_postgres.sql"
```

### Dry-run de movimentos

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_import_tpu_sql_itens.ps1" `
  -InputPath "D:\Downloads\tpu\movimento_dump_dados_oracle_postgres.sql" `
  -Entity movimento `
  -MaxRows 200
```

### Importar classes

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_import_tpu_sql_itens.ps1" `
  -InputPath "D:\Downloads\tpu\classe_dump_dados_oracle_postgres.sql" `
  -Entity classe `
  -Importar `
  -ServiceRole "SEU_SERVICE_ROLE"
```

### Importar assuntos

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_import_tpu_sql_itens.ps1" `
  -InputPath "D:\Downloads\tpu\assunto_dump_dados_oracle_postgres.sql" `
  -Entity assunto `
  -Importar `
  -ServiceRole "SEU_SERVICE_ROLE"
```

### Importar movimentos

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_import_tpu_sql_itens.ps1" `
  -InputPath "D:\Downloads\tpu\movimento_dump_dados_oracle_postgres.sql" `
  -Entity movimento `
  -Importar `
  -ServiceRole "SEU_SERVICE_ROLE"
```

### Importar documentos

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_import_tpu_sql_itens.ps1" `
  -InputPath "D:\Downloads\tpu\documento_dump_dados_oracle_postgres.sql" `
  -Entity documento `
  -Importar `
  -ServiceRole "SEU_SERVICE_ROLE"
```

## Critério de aceite

- `tpu_classe`, `tpu_assunto`, `tpu_movimento` e `tpu_documento` com carga anual no banco;
- [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts) reduzindo backlog de `movimentos sem movimento_tpu_id`;
- novos movimentos do DataJud saindo com `movimento_tpu_id` ou ao menos `tpu_status` consistente.

## Permissao necessaria no HMADV

Se a importacao retornar `42501` ou `permission denied`, aplique [hmadv_fase5_tpu_grants.sql](/D:/Github/newgit/docs/hmadv_fase5_tpu_grants.sql) antes de rodar a carga anual.
