# Relatório de Diagnóstico e Correção: Erros 404 em `/api/admin-auth-config` e `/api/public-chat-config`

**Data**: 28 de Abril de 2026  
**Status**: Problema Identificado e Soluções Propostas  
**Severidade**: Alta (Bloqueador de Autenticação)

---

## 1. Resumo Executivo

As rotas de API `/api/admin-auth-config` e `/api/public-chat-config` retornam **404 (Not Found)** em produção, impedindo o bootstrap de autenticação e configuração de chat no dashboard administrativo.

**Causa Raiz**: O processo de deploy local (`deploy_automatico.ps1` e `deploy_automatico.sh`) executa apenas `npm run build:pages` mas **não publica** o bundle completo para o Cloudflare Pages. Como resultado, as **Cloudflare Pages Functions** (que implementam `/api/*`) não são atualizadas em produção.

**Impacto**:
- Erro no console do navegador: `GET https://hermidamaia.adv.br/api/admin-auth-config 404 (Not Found)`
- Erro no console do navegador: `GET https://hermidamaia.adv.br/api/public-chat-config 404 (Not Found)`
- Dashboard administrativo não consegue inicializar autenticação Supabase
- Widget de chat público não consegue carregar configurações Freshchat

---

## 2. Análise Técnica

### 2.1 Estrutura de Deploy Atual

O repositório possui **três camadas de deploy**:

| Camada | Responsabilidade | Comando | Status |
|--------|------------------|---------|--------|
| **Cloudflare Pages** | Frontend + Pages Functions (`/api/*`) | `npm run build:pages` + Cloudflare connected build | ❌ Não publicado via scripts locais |
| **Worker hmadv-process-ai** | IA/Processamento (`ai.hermidamaia.adv.br`) | `npm run deploy:hmadv-ai` | ✅ Publicado corretamente |
| **Worker hmadv-api** | APIs adicionais (`api.hermidamaia.adv.br`) | `npm run deploy:hmadv-api` | ✅ Publicado corretamente |

### 2.2 Fluxo de Deploy Quebrado

**Arquivo**: `deploy_automatico.ps1` (linhas 1-20)

```powershell
npm run build:pages                    # ✅ Reconstrói artefatos localmente em out/
# ... (sem publicação do Pages)
npm run deploy:hmadv-ai               # ✅ Publica Worker hmadv-process-ai
npm run deploy:hmadv-api              # ✅ Publica Worker hmadv-api
# ❌ Falta: npm run deploy:pages ou publicação via Cloudflare Pages conectado
```

**Resultado**: 
- `out/functions/api/admin-auth-config.js` existe localmente
- `out/functions/api/public-chat-config.js` existe localmente
- Mas **não são publicados** para o Cloudflare Pages em produção

### 2.3 Rotas de API Afetadas

Ambas as rotas existem em dois lugares:

| Local | Arquivo | Status |
|-------|---------|--------|
| **pages/api/** | `admin-auth-config.js` | Next.js handler (não usado em deploy Pages) |
| **pages/api/** | `public-chat-config.js` | Next.js handler (não usado em deploy Pages) |
| **functions/api/** | `admin-auth-config.js` | Cloudflare Pages Function ✅ Implementado |
| **functions/api/** | `public-chat-config.js` | Cloudflare Pages Function ✅ Implementado |

O repositório usa **Cloudflare Pages Functions** (não Next.js handlers), então as rotas em `pages/api/` são apenas referência.

### 2.4 Configuração de Roteamento

**Arquivo**: `_routes.json` (gerado automaticamente)

```json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": ["/_next/static/*", "/_next/data/*", ...]
}
```

✅ Configuração está correta: `/api/*` é roteado para Pages Functions.

**Arquivo**: `_redirects` (gerado automaticamente)

```
/api/*   /api/:splat   200
```

✅ Rewrite está correto: requisições para `/api/*` passam pelas Functions.

---

## 3. Soluções Propostas

### Solução 1: Usar Cloudflare Pages Build Conectado (RECOMENDADO)

**Vantagem**: Automático, seguro, segue melhor prática.

**Passos**:

1. **Cloudflare Dashboard** → Projeto `newgit-pages` → Settings
2. **Build Configuration**:
   - Build command: `npm run build:pages`
   - Build output directory: `out`
   - Deploy on push: Ativado para branch `main`
3. **GitHub Integration**: Conectar repositório (já deve estar conectado)
4. **Fazer push** para `main` branch:
   ```bash
   git add .
   git commit -m "chore: trigger pages build"
   git push origin main
   ```

**Resultado**: Cloudflare automaticamente:
- Executa `npm run build:pages`
- Copia `functions/` para `out/functions`
- Gera `_redirects` e `_routes.json`
- Publica tudo como Pages Functions

### Solução 2: Deploy Manual via Wrangler (Alternativa)

**Vantagem**: Controle local, útil para testes.

**Passos**:

```bash
# 1. Construir o bundle completo
npm run build:pages

# 2. Verificar que as funções foram copiadas
ls -la out/functions/api/

# 3. Deploy via Wrangler (com permissão explícita)
ALLOW_STATIC_ONLY_PAGES_DEPLOY=1 npm run deploy:pages
```

**Nota**: O script `guard-pages-static-deploy.cjs` bloqueia este fluxo por padrão para evitar deploy parcial.

### Solução 3: Corrigir Scripts de Deploy Local

**Vantagem**: Automatiza o fluxo completo localmente.

**Arquivo a modificar**: `deploy_automatico.ps1`

```powershell
# Adicionar após "npm run build:pages":
Write-Host "Publicando Pages Functions para Cloudflare..."
$env:ALLOW_STATIC_ONLY_PAGES_DEPLOY = "1"
try {
  npm run deploy:pages
} finally {
  Remove-Item Env:ALLOW_STATIC_ONLY_PAGES_DEPLOY -ErrorAction SilentlyContinue
}

# Ou usar o script release:cf que já faz isso:
npm run release:cf -- -StaticPagesDeploy
```

**Arquivo a modificar**: `deploy_automatico.sh`

```bash
# Adicionar após "npm run build:pages":
echo "Publicando Pages Functions para Cloudflare..."
export ALLOW_STATIC_ONLY_PAGES_DEPLOY=1
npm run deploy:pages
unset ALLOW_STATIC_ONLY_PAGES_DEPLOY
```

---

## 4. Validação Pós-Deploy

### 4.1 Verificar via Diagnóstico

```bash
# Executar diagnóstico completo
npm run diagnose:pages-admin
```

**Esperado**:
```
admin-auth-config: ✅ status 200, ok: true
public-chat-config: ✅ status 200, ok: true
```

### 4.2 Verificar via cURL

```bash
# Testar admin-auth-config
curl -s https://hermidamaia.adv.br/api/admin-auth-config | jq .

# Esperado:
# {
#   "ok": true,
#   "url": "https://...",
#   "anonKey": "eyJ..."
# }

# Testar public-chat-config
curl -s https://hermidamaia.adv.br/api/public-chat-config | jq .

# Esperado:
# {
#   "ok": true,
#   "enabled": true,
#   "scriptUrl": "...",
#   ...
# }
```

### 4.3 Verificar no Console do Navegador

1. Abrir DevTools (F12)
2. Ir para aba **Network**
3. Recarregar página: `https://hermidamaia.adv.br/interno/login`
4. Procurar por:
   - `admin-auth-config` → Status **200** ✅
   - `public-chat-config` → Status **200** ✅

---

## 5. Recomendações de Longo Prazo

### 5.1 Documentação

- ✅ Arquivo `DEPLOY_WORKFLOW_SEGURO.md` já existe e está correto
- ✅ Arquivo `WORKFLOWS_DEPLOY_AUTOMATICO.md` já existe e está correto
- ⚠️ Adicionar avisos nos scripts `deploy_automatico.ps1` e `.sh` para evitar uso em produção

### 5.2 Automação

- ✅ GitHub Actions workflow `Validate Cloudflare Pages Runtime` já existe
- ✅ Valida `npm run build:pages` em cada push
- ⚠️ Não faz deploy automático (por segurança)
- ✅ Cloudflare Pages build conectado é a melhor prática

### 5.3 Proteção contra Regressão

**Adicionar ao `package.json`**:

```json
{
  "scripts": {
    "verify:pages-deploy": "npm run diagnose:pages-admin"
  }
}
```

**Adicionar ao GitHub Actions** (`.github/workflows/nextjs.yml`):

```yaml
- name: Verify Pages Functions after build
  run: npm run verify:pages-deploy
```

---

## 6. Checklist de Implementação

- [ ] **Opção 1 (Recomendada)**: Usar Cloudflare Pages build conectado
  - [ ] Verificar configuração no Cloudflare Dashboard
  - [ ] Fazer push para `main` branch
  - [ ] Aguardar build automático (2-5 minutos)
  - [ ] Validar com `npm run diagnose:pages-admin`

- [ ] **Opção 2**: Deploy manual via Wrangler
  - [ ] Executar `npm run build:pages`
  - [ ] Executar `ALLOW_STATIC_ONLY_PAGES_DEPLOY=1 npm run deploy:pages`
  - [ ] Validar com `npm run diagnose:pages-admin`

- [ ] **Opção 3**: Corrigir scripts de deploy local
  - [ ] Atualizar `deploy_automatico.ps1`
  - [ ] Atualizar `deploy_automatico.sh`
  - [ ] Testar localmente
  - [ ] Validar com `npm run diagnose:pages-admin`

- [ ] Adicionar proteção contra regressão
  - [ ] Atualizar `package.json` com `verify:pages-deploy`
  - [ ] Atualizar GitHub Actions workflow

---

## 7. Referências

| Arquivo | Propósito |
|---------|----------|
| `wrangler.toml` | Configuração Cloudflare Pages |
| `_routes.json` | Roteamento de funções |
| `_redirects` | Rewrites de URLs |
| `scripts/build-pages-static.cjs` | Build do Pages |
| `scripts/guard-pages-static-deploy.cjs` | Proteção contra deploy parcial |
| `scripts/release-cloudflare.ps1` | Release completo |
| `DEPLOY_WORKFLOW_SEGURO.md` | Documentação de deploy |
| `functions/api/admin-auth-config.js` | Implementação da rota |
| `functions/api/public-chat-config.js` | Implementação da rota |

---

## 8. Conclusão

O problema é **operacional**, não técnico. As rotas estão corretamente implementadas em `functions/api/`, mas não são publicadas em produção devido ao fluxo de deploy incompleto.

**Ação Imediata**: Use o Cloudflare Pages build conectado (Solução 1) para garantir que as Pages Functions sejam publicadas automaticamente a cada push para `main`.

**Ação Secundária**: Corrija os scripts `deploy_automatico.ps1` e `.sh` para incluir o deploy do Pages (Solução 3) se usar deploy local.
