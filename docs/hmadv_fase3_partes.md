<<<<<<< HEAD
# HMADV - Fase 3 Partes por Publicacoes

## Objetivo

Fazer backfill de `judiciario.partes` a partir do conteudo historico de publicacoes.

## Script

- [hmadv_reconciliar_partes_publicacoes.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_partes_publicacoes.ps1)

## Uso

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"

powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_partes_publicacoes.ps1" -Limite 50
```

Aplicacao real:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_partes_publicacoes.ps1" -Aplicar -Limite 50
```

## Regra

- extrair `Parte(s): NOME (A|P)` do conteudo
- classificar `ativo` e `passivo`
- inferir `tipo_pessoa`
- fazer upsert por `processo_id,nome,polo`

## Criterio de aceite

- `processos_com_publicacoes_sem_partes = 0`
=======
# HMADV - Fase 3: Partes a partir das Publicacoes

## Objetivo

Transformar o conteudo historico das publicacoes em dados estruturados de partes para:

- popular `judiciario.partes`;
- recalcular `polo_ativo` e `polo_passivo`;
- melhorar titulo e detalhes do processo no Freshsales;
- preparar a deteccao de audiencias em uma fase posterior.

## Base ja existente no projeto

O repositório já possui uma trilha de enriquecimento em:

- [processo-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/processo-sync/index.ts)

Action aproveitada:

- `action=enriquecer`

Essa trilha já:

- lê publicações com `processo_id`;
- tenta extrair partes do conteúdo;
- popula `judiciario.partes`;
- marca `publicacoes.adriano_polo`;
- atualiza títulos de processos quando ganha partes úteis.

## Script operacional

Usar:

- [hmadv_reconciliar_partes_publicacoes.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_partes_publicacoes.ps1)

### Auditoria sem executar

```powershell
$env:HMADV_SERVICE_ROLE="SEU_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_partes_publicacoes.ps1"
```

### Executar backfill de partes

```powershell
$env:HMADV_SERVICE_ROLE="SEU_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_partes_publicacoes.ps1" -ExecutarEnriquecimento -Limite 200
```

## O que medir

- `publicacoes_pendentes_partes`
- `partes_total`
- `processos_sem_polos`

## Criterio de aceite da Fase 3

- `judiciario.partes` cresce a partir das publicações históricas;
- `publicacoes.adriano_polo` deixa de ficar nulo nos casos processáveis;
- `processos_sem_polos` tende a cair;
- `fs-account-repair` passa a se beneficiar dessas partes para recalcular o account.

## Proximo passo apos a Fase 3

Quando a extração de partes estiver sob controle:

1. detectar audiências em movimentos e publicações;
2. persistir ou enfileirar audiências;
3. publicar no Freshsales em `Activities > Audiências`.
>>>>>>> codex/hmadv-tpu-fase53
