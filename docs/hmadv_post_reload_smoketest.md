# HMADV - Smoke Test Pós Reload do PostgREST

## Objetivo

Confirmar rapidamente que o `notify pgrst, 'reload schema';` entrou de fato no HMADV.

## Script

- [hmadv_post_reload_smoketest.ps1](/D:/Github/newgit/docs/hmadv_post_reload_smoketest.ps1)

## Uso

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_post_reload_smoketest.ps1"
```

## O que ele testa

1. `PATCH` em `judiciario.processos` usando `status_atual_processo`
2. `POST` em `judiciario.prazo_regra`
3. `GET` em `judiciario.prazo_regra`
4. `POST` em `judiciario.prazo_regra_alias`

## Leitura esperada

Quando o cache estiver correto:

- `patch_processos_status.ok = true`
- `post_prazo_regra.ok = true`
- `get_prazo_regra.ok = true`
- `post_prazo_regra_alias.ok = true`

Se ainda houver erro de cache, o retorno vai continuar vindo como:

- `PGRST204` para coluna nova
- `PGRST205` para tabela nova
