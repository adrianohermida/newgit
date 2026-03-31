# HMADV - Deploy do TPU Sync

## Estado atual confirmado

- `tpu_classe`: 200 registros
- `tpu_assunto`: 200 registros
- `tpu_movimento`: 200 registros
- `tpu_documento`: 200 registros
- backlog atual de movimentos sem TPU: 250
- a fase 5.3 agora tambem prepara complementos e temporalidade da TPU no repositorio

## Achado importante

A function `tpu-sync` publicada no HMADV ainda nao e a versao nova do repositório.

### Evidencia

O endpoint publicado responde com actions antigas:

- `status`
- `sync_all`
- `sync_classes`
- `sync_assuntos`
- `sync_movimentos`
- `sync_orgaos`
- `import_sql`
- `enriquecer_processo`

Mas a versao local em:

- [tpu-sync](D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts)

ja foi redesenhada para resolver movimentos pelo estoque local da TPU e devolver complementos quando o schema 5.3 estiver aplicado.

## Teste real feito

Chamada no HMADV publicado:

```text
GET /functions/v1/tpu-sync?action=sync_movimentos&limite=20
```

Resposta:

```json
{"ok":false,"entidade":"movimentos","fonte":"sgt_soap","erro":"nenhuma fonte retornou dados"}
```

Isso confirma que a function em producao ainda tenta a trilha antiga via SGT/SOAP e nao a resolucao local via `judiciario.tpu_movimento`.

## Proximo passo obrigatorio

Publicar a versao local de:

- [tpu-sync](D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts)

no projeto HMADV `sspvizogbcyigquqycsz`.

## Resultado esperado depois do deploy

O endpoint deve aceitar:

```text
GET /functions/v1/tpu-sync?action=resolver_lote_movimentos&limite=100
```

E retornar algo como:

- `resolvidos`
- `pendentes`
- `erros`
- `amostra`

## Validacao final

1. chamar `tpu-sync?action=status`
2. chamar `tpu-sync?action=resolver_lote_movimentos&limite=100`
3. rodar [hmadv_fase5_tpu_validacao.ps1](D:/Github/newgit/docs/hmadv_fase5_tpu_validacao.ps1)
4. confirmar queda de `movs_pendentes_tpu`
5. validar `resolver_movimento&codigo_cnj=92` e confirmar retorno de complementos

