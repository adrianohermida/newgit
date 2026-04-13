# HMADV - Comandos finais de fechamento

Data: 2026-04-13

## Objetivo

Executar, com comandos prontos, os ultimos passos para fechar:

- monitoramento
- contacts OAuth
- espelho `freshsales_contacts`
- piloto final

## Precondicao importante

Os scripts locais de diagnostico e refresh leem primeiro o arquivo `D:\Github\newgit\.dev.vars`.

Hoje o ambiente local ainda reconhece apenas o token global de deals e nao encontrou:

- `FRESHSALES_CONTACTS_REFRESH_TOKEN`
- `FRESHSALES_CONTACTS_ACCESS_TOKEN`

Entao, mesmo que o token de contacts exista em outro lugar, o fechamento local so vai passar sem fallback quando essas chaves estiverem disponiveis no runtime carregado pelo projeto.

## 1. Aplicar a migration de monitoramento

Arquivo:

- [055_add_monitoramento_ativo_to_processos.sql](/D:/Github/newgit/supabase/migrations/055_add_monitoramento_ativo_to_processos.sql)

### Opcao A. Supabase CLI

```powershell
cd D:\Github\newgit
npx supabase db push --project-ref sspvizogbcyigquqycsz
```

### Opcao B. SQL Editor

Abrir o conteudo do arquivo e executar no projeto `sspvizogbcyigquqycsz`.

### Verificacao

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'judiciario'
  and table_name = 'processos'
  and column_name = 'monitoramento_ativo';
```

## 2. Diagnosticar o OAuth de contacts

```powershell
cd D:\Github\newgit
node scripts/hmadv-doctor-freshsales-contacts-oauth.js
```

Esperado apos fechar o token:

- `has_contacts_refresh_token = true`
- status diferente de `authorization_required`

## 3. Autorizar o app de contacts

Gerar a URL de autorizacao:

```powershell
cd D:\Github\newgit
node scripts/hmadv-doctor-freshsales-contacts-oauth.js
```

Copiar `authorization_url`, abrir no navegador, autorizar e capturar o `code` do redirect.

## 4. Trocar o code por token

```powershell
cd D:\Github\newgit
node scripts/exchange-freshsales-auth-code.js contacts SEU_CODE_AQUI
```

Se voce tiver a URL completa de callback:

```powershell
cd D:\Github\newgit
node scripts/exchange-freshsales-auth-code.js contacts "https://sspvizogbcyigquqycsz.supabase.co/functions/v1/oauth?code=SEU_CODE_AQUI&state=contacts:hmadv-billing"
```

## 5. Refrescar e validar o token de contacts

```powershell
cd D:\Github\newgit
node scripts/refresh-freshsales-token.js contacts
```

Depois validar de novo:

```powershell
cd D:\Github\newgit
node scripts/hmadv-doctor-freshsales-contacts-oauth.js
```

## 6. Popular `freshsales_contacts`

### Dry run

```powershell
cd D:\Github\newgit
node scripts/sync-hmadv-freshsales-contacts-direct.js --dry-run --limit 100
```

### Importacao real

```powershell
cd D:\Github\newgit
node scripts/sync-hmadv-freshsales-contacts-direct.js --limit 5000
```

Referencia:

- [hmadv_sync_freshsales_contacts.md](/D:/Github/newgit/docs/hmadv_sync_freshsales_contacts.md)

## 7. Validar o piloto de contacts

```powershell
cd D:\Github\newgit
node scripts/hmadv-validate-contact-pilot.js
```

Opcional, informando outro CNJ:

```powershell
cd D:\Github\newgit
node scripts/hmadv-validate-contact-pilot.js 00001454220218260286
```

Esperado:

- `contacts_mirror_total > 0`
- depois da reconciliacao, `sync_rows_total > 0`

## 8. Validar monitoramento no painel

Depois da migration:

1. abrir `/interno/processos`
2. abrir as filas `monitoramento_ativo` e `monitoramento_inativo`
3. desativar 1 processo
4. reativar o mesmo processo

Esperado:

- sem `unsupported`
- sem fallback estrutural

## 9. Rodar reconciliacao de partes com contatos

Via frontend interno:

- acao: `Reconciliar partes com contatos`

Ou via endpoint:

```powershell
$body = @{
  action = "reconciliar_partes_contatos"
  limit = 10
  processNumbers = "00001454220218260286"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8788/api/admin-hmadv-processos" `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body $body
```

Observacao:

- ajuste a URL conforme o ambiente onde o admin estiver rodando

## 10. Smoketest final do fluxo principal

### Grupo 1. DataJud + CRM

- `Buscar movimentacoes no DataJud`
- `Sincronizar Supabase + Freshsales`

### Grupo 2. Publicacoes + movimentacoes

- `Sincronizar publicacoes no Freshsales`
- `Sincronizar movimentacoes no Freshsales`
- `Rodar sync-worker`

### Grupo 3. Contacts

- `Reconciliar partes com contatos`
- validar `freshsales_contacts`
- validar `processo_contato_sync`

### Grupo 4. Monitoramento + audiencias

- ativar/desativar monitoramento
- `Retroagir audiencias`

## 11. Queries rapidas de verificacao

### Ver se o espelho de contacts saiu do zero

```sql
select count(*) as freshsales_contacts_total
from public.freshsales_contacts;
```

### Ver se a reconciliacao passou a gravar vinculos

```sql
select count(*) as processo_contato_sync_total
from judiciario.processo_contato_sync;
```

### Ver se monitoramento esta gravando

```sql
select monitoramento_ativo, count(*) as total
from judiciario.processos
group by monitoramento_ativo
order by monitoramento_ativo;
```

## Criterio final de aceite

Podemos considerar o fechamento operacional muito proximo do ideal quando:

- a migration de monitoramento estiver aplicada
- o doctor de contacts mostrar refresh token presente
- `freshsales_contacts` estiver populada
- o piloto de contacts deixar de mostrar tudo zerado
- monitoramento funcionar sem `unsupported`
