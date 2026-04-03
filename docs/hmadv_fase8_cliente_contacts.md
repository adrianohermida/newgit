# HMADV - Fase 8 Cliente Principal e Contacts

## Objetivo

Abrir a frente de `cliente_hmadv + contacts relacionados` sem marcar cliente por chute.

O foco desta etapa e:

- marcar `representada_pelo_escritorio`
- marcar `cliente_hmadv`
- marcar `principal_no_account`
- medir quando a parte ainda nao pode virar `Contact` no Freshsales por falta de identificador minimo

## Premissa importante

Segundo a API do Freshsales, a criacao de `Contact` exige pelo menos um identificador de contato:

- email
- telefone/mobile
- twitter

No HMADV, hoje a fonte mais forte disponivel em `judiciario.partes` e:

- `documento`
- `tipo_pessoa`
- `nome`
- `polo`

Entao esta etapa comeca canonizando no Supabase e separando:

- casos com evidencia forte de cliente
- casos ainda bloqueados para CRM

Quando `public.freshsales_contacts` estiver populada, o reconciliador tambem passa a tentar:

- encontrar `Contact` existente por nome normalizado
- preencher `contato_freshsales_id` quando o match for unico e forte
- manter bloqueio quando o match for ambiguo

## Criacao controlada de contacts por tipo

Como proxima etapa operacional, o HMADV passa a aceitar criacao de `Contacts` com apenas `nome`, desde que:

- `Cliente`: somente para a parte com marcador forte do Dr. Adriano
- `Parte Adversa`: para a parte do polo oposto
- `Terceiro Interessado`: para demais partes sem classificacao mais forte

Runbook:

- [hmadv_fase8_contacts_tipo.md](/D:/Github/newgit/docs/hmadv_fase8_contacts_tipo.md)
- [hmadv_criar_contacts_relacionados.ps1](/D:/Github/newgit/docs/hmadv_criar_contacts_relacionados.ps1)

## Script operacional

- [hmadv_reconciliar_cliente_contacts.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_cliente_contacts.ps1)

## Regra usada nesta etapa

So marca cliente quando houver evidencia forte de publicacao contendo marcador do escritorio.

Fontes usadas nesta etapa:

- `raw_payload.nomeCliente`
- `raw_payload.nomeUsuarioCliente`
- conteudo livre da publicacao

Marcadores padrao:

- `ADRIANO MENEZES HERMIDA MAIA`
- `ADRIANO HERMIDA MAIA`
- `HERMIDA MAIA`
- `ADRIANO MENEZES`

Tambem aceita OABs via parametro.

## Uso

### Auditoria

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_cliente_contacts.ps1" -Limite 50
```

### Aplicacao real

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_cliente_contacts.ps1" -Aplicar -Limite 50
```

### Com OABs do escritorio

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_cliente_contacts.ps1" `
  -Aplicar `
  -Limite 50 `
  -OfficeOabs "SP-123456","SP-654321"
```

## Leitura do resultado

Campos principais:

- `processos_com_evidencia_forte`
- `processos_com_bloqueio_crm`
- `represented_pole`
- `principal_nome`
- `bloqueio_crm`

## Proximo passo

Depois desta etapa:

1. popular `public.freshsales_contacts`
2. consolidar os marcadores reais do escritorio
3. medir cobertura de `documento` em `judiciario.partes`
4. medir candidatos criaveis em [hmadv_fase8_candidatos_contacts.md](/D:/Github/newgit/docs/hmadv_fase8_candidatos_contacts.md)
5. decidir a estrategia de subida ao Freshsales:
   - vincular `Contact` existente quando houver match unico e forte
   - criar `Contact` por `nome + external_id + Tipo` quando a regra de classificacao for forte
   - ou manter apenas a canonizacao no Supabase quando ainda nao houver identificador minimo
