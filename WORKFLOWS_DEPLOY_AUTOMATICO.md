# Workflows de Deploy Automático

## 1. Cloudflare Pages (Frontend + API)

- **Deploy automático via GitHub:**
  - O Cloudflare Pages deve estar conectado ao repositório GitHub.
  - A cada push no branch principal (`main`), o Pages executa:
    - Build command: `npm run build:pages`
    - Output directory: `out`
    - Deploy command: (deixe vazio)
  - O deploy é feito automaticamente, incluindo funções de API.

### Exemplo de workflow (GitHub Actions não é necessário, pois o Pages já faz o deploy ao receber push):

## 2. Worker AI (hmadv-process-ai)

- **Deploy automático via GitHub Actions:**
  - Crie um workflow `.github/workflows/deploy-hmadv-ai.yml`:

```yaml
name: Deploy hmadv-process-ai Worker

on:
  push:
    branches: [main]
    paths:
      - 'workers/hmadv-process-ai/**'
      - '.github/workflows/deploy-hmadv-ai.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install Wrangler
        run: npm install -g wrangler
      - name: Deploy Worker
        run: |
          cd workers/hmadv-process-ai
          wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

- **Importante:**
  - Crie o segredo `CLOUDFLARE_API_TOKEN` no repositório GitHub (com permissão para deploy de Workers).
  - Ajuste o caminho do worker se necessário.

---

## 3. Dicas finais
- **Nunca use `wrangler pages deploy out` manualmente para produção.**
- **Sempre valide o deploy no painel do Cloudflare Pages e no painel de Workers.**
- **Mantenha variáveis de ambiente atualizadas nos dois ambientes.**

---

Com esses workflows, o deploy dos dois ambientes será automático e seguro a cada push no branch principal.
