# Guia de Implementação: Correção dos Erros 404 em `/api/admin-auth-config` e `/api/public-chat-config`

**Versão**: 1.0  
**Data**: 28 de Abril de 2026  
**Tempo Estimado**: 15-30 minutos

---

## 📋 Resumo Rápido

As rotas de API retornam 404 porque as **Cloudflare Pages Functions** não estão sendo publicadas em produção. Existem 3 soluções:

1. ✅ **RECOMENDADA**: Usar Cloudflare Pages build conectado (automático)
2. ⚠️ **ALTERNATIVA**: Deploy manual via Wrangler
3. 🔧 **OPCIONAL**: Corrigir scripts de deploy local

---

## 🎯 Solução 1: Cloudflare Pages Build Conectado (RECOMENDADA)

### Por que é a melhor opção?
- ✅ Automático a cada push para `main`
- ✅ Seguro (evita deploy parcial)
- ✅ Segue melhor prática da indústria
- ✅ Sem necessidade de credenciais locais

### Passos:

#### 1.1 Verificar Configuração no Cloudflare Dashboard

1. Acesse: https://dash.cloudflare.com
2. Selecione o projeto: **newgit-pages**
3. Vá para: **Deployments** → **Build & Deploy**
4. Verifique:
   - ✅ **Production branch**: `main`
   - ✅ **Build command**: `npm run build:pages`
   - ✅ **Build output directory**: `out`
   - ✅ **GitHub integration**: Conectado

**Se tudo está correto**, pule para o passo 1.2.

**Se algo está faltando**, configure manualmente:
- Build command: `npm run build:pages`
- Build output directory: `out`
- Salve as alterações

#### 1.2 Fazer Push para Ativar Build

```bash
# Na raiz do repositório
cd D:\Github\newgit

# Fazer um commit (mesmo que vazio)
git add .
git commit -m "chore: trigger cloudflare pages build" --allow-empty

# Push para main
git push origin main
```

#### 1.3 Aguardar Build Automático

1. Acesse: https://dash.cloudflare.com/newgit-pages/deployments
2. Procure pelo build mais recente
3. Aguarde status: **✅ Success** (2-5 minutos)

#### 1.4 Validar Publicação

```bash
# Testar via cURL
curl -s https://hermidamaia.adv.br/api/admin-auth-config | jq .

# Esperado (status 200):
# {
#   "ok": true,
#   "url": "https://...",
#   "anonKey": "eyJ..."
# }
```

✅ **Pronto!** As rotas agora devem funcionar.

---

## ⚠️ Solução 2: Deploy Manual via Wrangler

### Quando usar?
- Testes locais rápidos
- Desenvolvimento
- Quando o build conectado falha

### Passos:

#### 2.1 Preparar Credenciais

```bash
# Verificar se Wrangler está autenticado
wrangler whoami

# Se não estiver, autenticar:
wrangler login
```

#### 2.2 Executar Build

```bash
cd D:\Github\newgit
npm run build:pages
```

**Esperado**: Pasta `out/` criada com:
- `out/index.html` ✅
- `out/_next/static/` ✅
- `out/functions/api/admin-auth-config.js` ✅
- `out/functions/api/public-chat-config.js` ✅
- `out/_redirects` ✅
- `out/_routes.json` ✅

#### 2.3 Fazer Deploy

```bash
# Deploy com permissão explícita
$env:ALLOW_STATIC_ONLY_PAGES_DEPLOY = "1"
npm run deploy:pages
Remove-Item Env:ALLOW_STATIC_ONLY_PAGES_DEPLOY
```

**Ou em Bash/Linux**:

```bash
export ALLOW_STATIC_ONLY_PAGES_DEPLOY=1
npm run deploy:pages
unset ALLOW_STATIC_ONLY_PAGES_DEPLOY
```

#### 2.4 Validar Publicação

```bash
# Aguardar 30 segundos para propagação
Start-Sleep -Seconds 30

# Testar
curl -s https://hermidamaia.adv.br/api/admin-auth-config | jq .
```

✅ **Pronto!** As rotas agora devem funcionar.

---

## 🔧 Solução 3: Corrigir Scripts de Deploy Local

### Quando usar?
- Quando usa `deploy_automatico.ps1` ou `deploy_automatico.sh` regularmente
- Para automatizar deploy local completo

### Passos:

#### 3.1 Fazer Backup dos Scripts Originais

```bash
# PowerShell
Copy-Item deploy_automatico.ps1 deploy_automatico.ps1.bak

# Bash
cp deploy_automatico.sh deploy_automatico.sh.bak
```

#### 3.2 Substituir pelos Scripts Corrigidos

**Opção A**: Usar os arquivos `*_FIXED` fornecidos

```bash
# PowerShell
Copy-Item deploy_automatico_FIXED.ps1 deploy_automatico.ps1

# Bash
cp deploy_automatico_FIXED.sh deploy_automatico.sh
chmod +x deploy_automatico.sh
```

**Opção B**: Editar manualmente

**Para PowerShell** (`deploy_automatico.ps1`):

Adicione após a linha `npm run build:pages`:

```powershell
# Deploy do Cloudflare Pages (com Pages Functions)
Write-Host "Deployando Cloudflare Pages..." -ForegroundColor Cyan
$env:ALLOW_STATIC_ONLY_PAGES_DEPLOY = "1"
try {
    npm run deploy:pages
} finally {
    Remove-Item Env:ALLOW_STATIC_ONLY_PAGES_DEPLOY -ErrorAction SilentlyContinue
}
Write-Host "Deploy do Pages concluído." -ForegroundColor Green
```

**Para Bash** (`deploy_automatico.sh`):

Adicione após `npm run build:pages`:

```bash
# Deploy do Cloudflare Pages (com Pages Functions)
echo "Deployando Cloudflare Pages..."
export ALLOW_STATIC_ONLY_PAGES_DEPLOY=1
npm run deploy:pages
unset ALLOW_STATIC_ONLY_PAGES_DEPLOY
echo "Deploy do Pages concluído."
```

#### 3.3 Testar o Script Corrigido

```bash
# PowerShell
.\deploy_automatico.ps1

# Bash
./deploy_automatico.sh
```

**Esperado**:
- ✅ Build do Pages
- ✅ Deploy do Pages (com Pages Functions)
- ✅ Deploy do Worker hmadv-process-ai
- ✅ Deploy do Worker hmadv-api
- ✅ Verificação pós-deploy

✅ **Pronto!** As rotas agora devem funcionar.

---

## ✅ Validação Pós-Implementação

### Teste 1: Via cURL

```bash
# Testar admin-auth-config
curl -i https://hermidamaia.adv.br/api/admin-auth-config

# Esperado:
# HTTP/2 200
# content-type: application/json
# cache-control: private, max-age=300
# 
# {"ok":true,"url":"https://...","anonKey":"eyJ..."}

# Testar public-chat-config
curl -i https://hermidamaia.adv.br/api/public-chat-config

# Esperado:
# HTTP/2 200
# content-type: application/json
# 
# {"ok":true,"enabled":true,"scriptUrl":"...","runtimeScriptUrl":"..."}
```

### Teste 2: Via DevTools do Navegador

1. Abrir: https://hermidamaia.adv.br/interno/login
2. Pressionar: **F12** (DevTools)
3. Ir para: **Network** tab
4. Recarregar página: **F5**
5. Procurar por:
   - `admin-auth-config` → Status **200** ✅
   - `public-chat-config` → Status **200** ✅

### Teste 3: Via Script de Diagnóstico

```bash
npm run diagnose:pages-admin
```

**Esperado**:
```
admin-auth-config: ✅ reachable, status 200
public-chat-config: ✅ reachable, status 200
```

### Teste 4: Verificar Funcionalidade

1. Abrir: https://hermidamaia.adv.br/interno/login
2. Verificar:
   - ✅ Dashboard carrega sem erros de autenticação
   - ✅ Widget de chat carrega (canto inferior direito)
   - ✅ Sem erros 404 no console (F12 → Console)

---

## 🚨 Troubleshooting

### Problema: Ainda recebo 404 após deploy

**Solução 1**: Limpar cache do navegador
```bash
# Chrome/Edge: Ctrl+Shift+Delete
# Firefox: Ctrl+Shift+Delete
# Safari: Cmd+Shift+Delete
```

**Solução 2**: Aguardar propagação de DNS
- Espere 2-5 minutos após deploy
- Teste em navegador privado/incógnito

**Solução 3**: Verificar se o build foi bem-sucedido
```bash
# Verificar artefatos
ls -la out/functions/api/admin-auth-config.js
ls -la out/functions/api/public-chat-config.js
```

### Problema: Erro "ALLOW_STATIC_ONLY_PAGES_DEPLOY" não reconhecido

**Solução**: Usar sintaxe correta para seu shell

**PowerShell**:
```powershell
$env:ALLOW_STATIC_ONLY_PAGES_DEPLOY = "1"
npm run deploy:pages
Remove-Item Env:ALLOW_STATIC_ONLY_PAGES_DEPLOY
```

**Bash**:
```bash
export ALLOW_STATIC_ONLY_PAGES_DEPLOY=1
npm run deploy:pages
unset ALLOW_STATIC_ONLY_PAGES_DEPLOY
```

### Problema: Wrangler não está autenticado

**Solução**:
```bash
wrangler login
# Seguir instruções no navegador
```

### Problema: Build falha com erro de dependências

**Solução**:
```bash
# Limpar cache e reinstalar
rm -rf node_modules package-lock.json
npm ci
npm run build:pages
```

---

## 📚 Referências

| Documento | Propósito |
|-----------|----------|
| `RELATORIO_FIX_AUTH_404.md` | Análise técnica completa |
| `DEPLOY_WORKFLOW_SEGURO.md` | Documentação de deploy |
| `wrangler.toml` | Configuração Cloudflare Pages |
| `scripts/build-pages-static.cjs` | Script de build |
| `scripts/guard-pages-static-deploy.cjs` | Proteção contra deploy parcial |

---

## 🎓 Próximos Passos

### Curto Prazo (Hoje)
- [ ] Escolher uma das 3 soluções
- [ ] Implementar conforme o guia
- [ ] Validar com os 4 testes acima

### Médio Prazo (Esta Semana)
- [ ] Adicionar verificação pós-deploy ao GitHub Actions
- [ ] Documentar no README do projeto
- [ ] Treinar equipe sobre o novo fluxo

### Longo Prazo (Este Mês)
- [ ] Remover scripts `deploy_automatico.*` se usar build conectado
- [ ] Implementar monitoramento de 404s em produção
- [ ] Criar alertas para falhas de deploy

---

## ❓ Dúvidas?

Consulte:
1. `RELATORIO_FIX_AUTH_404.md` - Análise técnica
2. `DEPLOY_WORKFLOW_SEGURO.md` - Documentação oficial
3. `scripts/diagnose-pages-admin-runtime.ps1` - Diagnóstico detalhado

---

**Status**: ✅ Pronto para implementação

**Última atualização**: 28 de Abril de 2026
