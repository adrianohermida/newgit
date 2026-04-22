# Deploy do projeto

Este repositorio deve publicar no projeto Cloudflare Pages `newgit-pages`.

O recurso `newgit` nao deve ser usado para deploy deste codigo. Se ele ainda existir no Cloudflare, mantenha-o apenas se tiver outra funcao operacional; caso contrario, remova-o ou deixe sem relacao com este repositorio para evitar conflito.

## Cloudflare Pages1

Configure o projeto `newgit-pages` assim:

1. `Build command`: `npm run build`
2. `Build output directory`: `out`
3. `Deploy command`: deixe vazio
4. Variaveis e secrets: configure os mesmos valores usados no ambiente local e no teste de integracao

Deploy manual:

```bash
npm run deploy:pages
```

Release completo (commit + push + deploy worker):

```bash
npm run release:cf -- -CommitMessage "sua mensagem"
```

Automacao opcional no build (build + deploy Wrangler):

Windows PowerShell:

```powershell
$env:AUTO_DEPLOY_WRANGLER='1'; npm run build; Remove-Item Env:AUTO_DEPLOY_WRANGLER -ErrorAction SilentlyContinue
```

Quando `AUTO_DEPLOY_WRANGLER=1`, o `npm run build` dispara automaticamente:

- `npm run release:cf -- -SkipCommit -SkipPush -StaticPagesDeploy`
- deploy do worker `hmadv-process-ai`
- deploy estatico do Pages via Wrangler (opt-in explicito)

Importante:

- `wrangler pages deploy out` publica apenas o conteudo estatico de `out`
- esse fluxo nao envia `functions/` nem `_routes.json`
- se usado sozinho, pode deixar `/api/*` indisponivel em producao
- para runtime administrativo completo, prefira o build conectado do Cloudflare Pages a partir do repositorio
- se o console mostrar `POST /api/admin-lawdesk-chat 404` e `POST /functions/api/admin-lawdesk-chat 405`, trate como indicio de deploy estatico puro sobrescrevendo o runtime do Pages
- nesse caso, republique o projeto `newgit-pages` pelo build conectado do Cloudflare Pages e confirme o diagnostico com `npm run diagnose:pages-admin`

Observacao sobre o modulo `HMADV Market Ads`:

- o frontend publicado no Pages continua funcional mesmo se `/api/admin-market-ads` estiver indisponivel
- nesse caso, o modulo entra em `modo local`, carrega dados locais e persiste operacoes no navegador
- o backend administrativo completo do modulo ainda depende de um runtime server compativel com dependencias Node que hoje nao estao fechando no Pages Functions
- apos cada deploy, valide com:

```bash
npm run diagnose:pages-admin
```

Deploy por GitHub Actions:

- o workflow [`.github/workflows/nextjs.yml`](/workspaces/newgit/.github/workflows/nextjs.yml) nao deve mais sobrescrever producao com upload estatico puro
- exige `CLOUDFLARE_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` nos secrets do GitHub

## Desenvolvimento local

Para testar o runtime de Pages localmente:

```bash
npm run dev:pages
```

Isso sobe o site estatico e as `functions/api/*` com `wrangler pages dev`.
