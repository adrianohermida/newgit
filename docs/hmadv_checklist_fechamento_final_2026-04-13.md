# HMADV - Checklist final de fechamento

Data: 2026-04-13

## Objetivo

Executar os ultimos passos para deixar o fluxo HMADV o mais proximo possivel de:

- marcar a tag `datajud` no Freshsales
- deixar DataJud + Advise + publicacoes + movimentacoes + fila rodando com minima intervencao manual

## Pendencias reais restantes

1. aplicar a migration de `monitoramento_ativo`
2. gravar `FRESHSALES_CONTACTS_REFRESH_TOKEN`
3. popular `public.freshsales_contacts`
4. executar smoketest final

## Ordem recomendada

### Etapa 1. Aplicar migration de monitoramento

Arquivo:

- [055_add_monitoramento_ativo_to_processos.sql](/D:/Github/newgit/supabase/migrations/055_add_monitoramento_ativo_to_processos.sql)

Objetivo:

- criar `judiciario.processos.monitoramento_ativo`
- destravar leitura e escrita corretas do painel de monitoramento

Aceite:

- `monitoramento_ativo` deixa de voltar `unsupported`
- acoes de ativar/desativar monitoramento deixam de cair em fallback estrutural

### Etapa 2. Fechar OAuth de contacts

Necessario no runtime:

- `FRESHSALES_CONTACTS_REFRESH_TOKEN`

Ja validado no codigo:

- client id
- client secret
- scopes
- redirect uri

Sequencia:

1. autorizar o app de contacts
2. obter o `code`
3. trocar o `code`
4. gravar `FRESHSALES_CONTACTS_REFRESH_TOKEN`
5. validar refresh/token

Scripts uteis:

- [hmadv-doctor-freshsales-contacts-oauth.js](/D:/Github/newgit/scripts/hmadv-doctor-freshsales-contacts-oauth.js)
- [exchange-freshsales-auth-code.js](/D:/Github/newgit/scripts/exchange-freshsales-auth-code.js)
- [refresh-freshsales-token.js](/D:/Github/newgit/scripts/refresh-freshsales-token.js)

Aceite:

- diagnostico de contacts deixa de mostrar `authorization_required`
- runtime passa a ter refresh token de contacts

### Etapa 3. Popular `freshsales_contacts`

Caminho recomendado:

- [hmadv_sync_freshsales_contacts.md](/D:/Github/newgit/docs/hmadv_sync_freshsales_contacts.md)

Script principal:

- [sync-hmadv-freshsales-contacts-direct.js](/D:/Github/newgit/scripts/sync-hmadv-freshsales-contacts-direct.js)

Sequencia:

1. rodar dry-run
2. rodar importacao real
3. validar volume importado

Aceite:

- `public.freshsales_contacts` deixa de ficar vazio
- `contacts_mirror_total` no piloto deixa de ser `0`

### Etapa 4. Validar piloto de contacts

Script:

- [hmadv-validate-contact-pilot.js](/D:/Github/newgit/scripts/hmadv-validate-contact-pilot.js)

Aceite minimo:

- `contacts_mirror_total > 0`
- `partes_com_contato > 0` ou pelo menos reconciliador passa a ter candidatos reais
- `sync_rows_total > 0` apos rodar reconciliacao

### Etapa 5. Smoketest final de monitoramento

No frontend interno de processos:

1. abrir `monitoramento_ativo`
2. abrir `monitoramento_inativo`
3. testar desativar um processo
4. testar reativar o mesmo processo

Aceite:

- sem `unsupported`
- sem fallback estrutural
- gravacao refletida no banco

### Etapa 6. Smoketest final de operacao HMADV

Executar por grupos:

1. DataJud + CRM
2. Publicacoes + movimentacoes
3. Contacts
4. Monitoramento + audiencias

Aceite por grupo:

- sem erro estrutural
- sem dependencia manual inesperada
- backlog reduz ou evolui na direcao correta

## Criterio de aceite final

Podemos considerar o fluxo praticamente fechado quando:

- `monitoramento_ativo` estiver aplicado e funcional
- `FRESHSALES_CONTACTS_REFRESH_TOKEN` estiver valido
- `freshsales_contacts` estiver populada
- o piloto de contacts mostrar vinculacao real
- os quatro grupos de smoketest passarem

## Resultado esperado apos fechamento

Com isso, o fluxo operacional esperado passa a ser:

1. marcar a account/processo com tag `datajud`
2. runner executa DataJud tagged
3. Advise alimenta publicacoes
4. publicacoes e movimentacoes viram activities
5. contacts espelhados alimentam reconciliacao de partes
6. fila HMADV drena o restante automaticamente

## Observacao importante

Mesmo apos o fechamento, estas acoes ainda devem ser tratadas como operacoes de suporte e nao como coracao do cron principal:

- `repair_freshsales_accounts`
- `push_orfaos`
- `backfill_audiencias`
- `runProcessAudit`

Elas podem continuar existindo como reparo/manual assistido sem impedir a automacao principal.
