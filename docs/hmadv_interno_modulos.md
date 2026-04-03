# HMADV Interno: Modulos de Processos e Publicacoes

## Objetivo

Disponibilizar no painel interno de [https://hermidamaia.adv.br/interno/](https://hermidamaia.adv.br/interno/) dois modulos operacionais para acionar rotinas administrativas do HMADV sem depender do terminal:

- `Gestao de Processos`
- `Gestao de Publicacoes`

## Rotas de frontend

- `/interno/processos`
- `/interno/publicacoes`

## Backend em producao

O projeto usa `Next export`, entao `pages/api/*` nao atende no deploy final. As rotas administrativas que sustentam esses modulos precisam rodar via Cloudflare Pages Functions:

- `/api/admin-hmadv-processos`
- `/api/admin-hmadv-publicacoes`

Arquivos:

- [processos.js](D:/Github/newgit/pages/interno/processos.js)
- [publicacoes.js](D:/Github/newgit/pages/interno/publicacoes.js)
- [admin-hmadv-processos.js](D:/Github/newgit/functions/api/admin-hmadv-processos.js)
- [admin-hmadv-publicacoes.js](D:/Github/newgit/functions/api/admin-hmadv-publicacoes.js)
- [hmadv-ops.js](D:/Github/newgit/functions/lib/hmadv-ops.js)

## Funcoes disponiveis

### Gestao de Processos

- visao geral de processos, DataJud e fila do `sync-worker`
- varredura de processos orfaos
- criacao de `Sales Accounts` para processos orfaos
- reparo de sincronizacao de processos ja vinculados ao Freshsales
- leitura de audiencias persistidas
- retroativo de audiencias a partir de publicacoes
- disparo do `sync-worker`

### Gestao de Publicacoes

- visao geral do backlog de publicacoes
- criacao de processos a partir de publicacoes ainda sem `processo_id`
- leitura de publicacoes com e sem activity no Freshsales
- leitura de publicacoes filtradas como `LEILAO_IGNORADO`
- extracao retroativa de partes a partir do conteudo das publicacoes
- disparo do `sync-worker`

## Deploy

### 1. Build local

```powershell
cd D:\Github\newgit
npm run build
npx wrangler pages functions build functions --outdir .wrangler/functions-build --project-directory .
```

### 2. Publicacao no Cloudflare Pages

```powershell
cd D:\Github\newgit
npx wrangler pages deploy out --project-name=newgit-pages
```

## Variaveis de ambiente necessarias no Pages

- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `FRESHSALES_API_BASE`
- `FRESHSALES_API_KEY`
- `FRESHSALES_ACTIVITY_TYPE_BY_EVENT`
- `FRESHSALES_APPOINTMENT_FIELD_MAP`

As funcoes administrativas tambem dependem da autenticacao do painel interno ja existente.

## Observacoes operacionais

- O Freshsales trabalha com limite de `1.000` requisicoes por hora.
- O `sync-worker` local ja foi preparado para respeitar um intervalo minimo por request via `FRESHSALES_MIN_INTERVAL_MS`.
- O painel agora limita retroativos a lotes menores para evitar `Too many subrequests by single Worker invocation`.
- Ao usar os modulos internos, priorizar lotes pequenos para retroativos:
  - audiencias: `10` a `50`
  - partes por publicacoes: `20` a `100`
  - criacao de processos por publicacoes: `5` a `15`
  - reparo de contas no Freshsales: `5` a `10`
  - criacao de accounts orfaos: `10` a `20`

## Ordem recomendada de uso

1. Abrir `Gestao de Processos` e atualizar o status.
2. Se houver processos sem account, usar `Criar accounts orfaos`.
3. Se houver processos com account desatualizado, usar `Corrigir contas no Freshsales`.
4. Rodar simulacao do retroativo de audiencias com CNJs alvo.
5. Aplicar o retroativo em lotes pequenos.
6. Abrir `Gestao de Publicacoes`.
7. Rodar `Criar processos das publicacoes` para reduzir `publicacoes sem processo`.
8. Rodar simulacao da extracao retroativa de partes.
9. Aplicar a extracao em lotes pequenos.
10. Rodar `sync-worker`.
11. Validar reflexo no Freshsales.

## Estado atual conhecido

- o runtime de Pages Functions ja compila com sucesso;
- o frontend de `/interno/processos` e `/interno/publicacoes` ja compila;
- o retroativo de audiencias ja persistiu linhas reais em `judiciario.audiencias`;
- ainda falta publicar a versao nova do `sync-worker` para fallback automatico de activity de audiencia quando o tipo especifico estiver removido no tenant.
