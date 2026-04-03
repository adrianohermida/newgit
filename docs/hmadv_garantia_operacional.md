# HMADV - Garantia Operacional de Publicacoes, Partes e Audiencias

## Objetivo

Transformar a ideia de "garantia" em auditoria objetiva do HMADV.

Este bloco mede:

- se as publicacoes validas ja viraram `sales_activity` no Freshsales
- se o filtro de leilao esta isolando apenas `LEILAO` e `LEILOES`
- se as partes ja estao persistidas
- se `data_ajuizamento` ja esta preenchida
- se sinais de audiencia nas publicacoes ja viraram linhas em `judiciario.audiencias`

## Script operacional

- [hmadv_auditar_garantia_operacional.ps1](/D:/Github/newgit/docs/hmadv_auditar_garantia_operacional.ps1)

## Como interpretar

### Publicacoes

Campos principais:

- `publicacoes_com_activity_real`
- `publicacoes_leilao_ignorado`
- `publicacoes_pendentes_com_account`
- `publicacoes_pendentes_nao_leilao_com_account`

Criterio de aceite:

- `publicacoes_pendentes_nao_leilao_com_account = 0`

Enquanto esse numero nao zerar, nao existe garantia plena de que todas as publicacoes validas ja foram sincronizadas no Freshsales.

### Partes

Campos principais:

- `processos_com_publicacoes_sem_partes`
- `processos_com_publicacoes_sem_polos_no_processo`

Criterio de aceite:

- `processos_com_publicacoes_sem_partes = 0`
- `processos_com_publicacoes_sem_polos_no_processo = 0`

### Data de distribuicao

Campos principais:

- `processos_com_data_ajuizamento`
- `processos_sem_data_ajuizamento`

Criterio de aceite:

- `processos_sem_data_ajuizamento` deve cair de forma sustentada

### Audiencias

Campos principais:

- `audiencias_total`
- `processos_com_sinal_audiencia_em_publicacoes`
- `publicacoes_com_sinal_audiencia_sem_linha_audiencia`
- `publicacoes_com_sinal_audiencia_sem_activity`

Criterio de aceite:

- `publicacoes_com_sinal_audiencia_sem_linha_audiencia = 0`
- audiencias futuras passam a gerar:
  - activity em `Audiencias`
  - `Appointment`

## Uso

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"

powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_auditar_garantia_operacional.ps1"
```

## Observacao importante

Se houver muitas audiencias antigas apenas no conteudo das publicacoes, isso indica que a frente de `audiencias` ainda precisa de:

1. extracao retroativa das publicacoes
2. persistencia em `judiciario.audiencias`
3. sincronizacao de `Audiencias` no Freshsales
4. criacao de `Appointment` para as futuras
