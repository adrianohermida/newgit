# HMADV - Fase 8 Candidatos a Contacts

## Objetivo

Medir se ja existem candidatos seguros a `Contact` a partir do proprio HMADV, antes de criar qualquer registro no Freshsales.

## Script

- [hmadv_gerar_candidatos_contacts.ps1](/D:/Github/newgit/docs/hmadv_gerar_candidatos_contacts.ps1)

## Regra

O script:

1. pega processos com `account_id_freshsales`
2. confirma marcador do escritorio em `publicacoes.raw_payload`
3. infere o polo representado
4. escolhe a parte principal candidata
5. tenta extrair:
   - `email`
   - `telefone`
   - ou reaproveitar `documento`

## Uso

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"

powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_gerar_candidatos_contacts.ps1" -Limite 100
```

## Interpretacao

- `candidatos_com_email`
- `candidatos_com_telefone`
- `candidatos_sem_identificador`

Se os candidatos continuarem sem identificador, a fase de `Contacts` deve seguir primeiro em:

- canonizacao no Supabase
- vinculacao apenas quando houver dado seguro
