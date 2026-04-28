# Checklist de Implementação: Correção dos Erros 404

**Problema**: `/api/admin-auth-config` e `/api/public-chat-config` retornam 404  
**Solução**: Publicar Cloudflare Pages Functions em produção  
**Data de Início**: _______________  
**Data de Conclusão**: _______________  

---

## 📋 PRÉ-IMPLEMENTAÇÃO

- [ ] Ler `RESUMO_EXECUTIVO.md` (5 min)
- [ ] Ler `RELATORIO_FIX_AUTH_404.md` (10 min)
- [ ] Escolher uma das 3 soluções (ver `GUIA_IMPLEMENTACAO_FIX_AUTH.md`)
- [ ] Fazer backup do repositório (opcional)
- [ ] Notificar equipe sobre manutenção (se necessário)

---

## 🚀 IMPLEMENTAÇÃO - OPÇÃO 1 (RECOMENDADA)

### Cloudflare Pages Build Conectado

**Tempo**: ~5 minutos  
**Risco**: Baixo  
**Automatização**: Alta  

### Passos

- [ ] **1.1 - Verificar Configuração**
  - [ ] Acessar: https://dash.cloudflare.com
  - [ ] Selecionar projeto: `newgit-pages`
  - [ ] Ir para: Deployments → Build & Deploy
  - [ ] Verificar:
    - [ ] Production branch: `main`
    - [ ] Build command: `npm run build:pages`
    - [ ] Build output directory: `out`
    - [ ] GitHub integration: Conectado

- [ ] **1.2 - Fazer Push**
  ```bash
  git add .
  git commit -m "chore: trigger pages build" --allow-empty
  git push origin main
  ```

- [ ] **1.3 - Aguardar Build**
  - [ ] Acessar: https://dash.cloudflare.com/newgit-pages/deployments
  - [ ] Procurar pelo build mais recente
  - [ ] Aguardar status: ✅ Success (2-5 minutos)

- [ ] **1.4 - Validar**
  ```bash
  curl -i https://hermidamaia.adv.br/api/admin-auth-config
  # Esperado: HTTP/2 200
  ```

---

## 🚀 IMPLEMENTAÇÃO - OPÇÃO 2 (ALTERNATIVA)

### Deploy Manual via Wrangler

**Tempo**: ~10 minutos  
**Risco**: Médio  
**Automatização**: Baixa  

### Passos

- [ ] **2.1 - Verificar Autenticação**
  ```bash
  wrangler whoami
  # Se falhar: wrangler login
  ```

- [ ] **2.2 - Build**
  ```bash
  npm run build:pages
  ```
  - [ ] Verificar `out/` foi criado
  - [ ] Verificar `out/functions/api/admin-auth-config.js` existe
  - [ ] Verificar `out/functions/api/public-chat-config.js` existe

- [ ] **2.3 - Deploy**
  ```bash
  # PowerShell
  $env:ALLOW_STATIC_ONLY_PAGES_DEPLOY = "1"
  npm run deploy:pages
  Remove-Item Env:ALLOW_STATIC_ONLY_PAGES_DEPLOY
  
  # Bash
  export ALLOW_STATIC_ONLY_PAGES_DEPLOY=1
  npm run deploy:pages
  unset ALLOW_STATIC_ONLY_PAGES_DEPLOY
  ```

- [ ] **2.4 - Aguardar Propagação**
  - [ ] Esperar 30 segundos

- [ ] **2.5 - Validar**
  ```bash
  curl -i https://hermidamaia.adv.br/api/admin-auth-config
  # Esperado: HTTP/2 200
  ```

---

## 🚀 IMPLEMENTAÇÃO - OPÇÃO 3 (OPCIONAL)

### Corrigir Scripts de Deploy Local

**Tempo**: ~15 minutos  
**Risco**: Baixo  
**Automatização**: Alta (local)  

### Passos

- [ ] **3.1 - Backup**
  ```bash
  # PowerShell
  Copy-Item deploy_automatico.ps1 deploy_automatico.ps1.bak
  
  # Bash
  cp deploy_automatico.sh deploy_automatico.sh.bak
  ```

- [ ] **3.2 - Substituir Scripts**
  - [ ] **PowerShell**:
    ```bash
    Copy-Item deploy_automatico_FIXED.ps1 deploy_automatico.ps1
    ```
  - [ ] **Bash**:
    ```bash
    cp deploy_automatico_FIXED.sh deploy_automatico.sh
    chmod +x deploy_automatico.sh
    ```

- [ ] **3.3 - Testar**
  ```bash
  # PowerShell
  .\deploy_automatico.ps1
  
  # Bash
  ./deploy_automatico.sh
  ```
  - [ ] Build do Pages bem-sucedido
  - [ ] Deploy do Pages bem-sucedido
  - [ ] Deploy do Worker hmadv-process-ai bem-sucedido
  - [ ] Deploy do Worker hmadv-api bem-sucedido

- [ ] **3.4 - Validar**
  ```bash
  curl -i https://hermidamaia.adv.br/api/admin-auth-config
  # Esperado: HTTP/2 200
  ```

---

## ✅ VALIDAÇÃO PÓS-IMPLEMENTAÇÃO

### Teste 1: cURL
- [ ] Executar:
  ```bash
  curl -i https://hermidamaia.adv.br/api/admin-auth-config
  curl -i https://hermidamaia.adv.br/api/public-chat-config
  ```
- [ ] Ambos retornam HTTP/2 200 ✅

### Teste 2: DevTools
- [ ] Abrir: https://hermidamaia.adv.br/interno/login
- [ ] Pressionar: F12 (DevTools)
- [ ] Ir para: Network tab
- [ ] Recarregar: F5
- [ ] Procurar:
  - [ ] `admin-auth-config` → Status 200 ✅
  - [ ] `public-chat-config` → Status 200 ✅

### Teste 3: Diagnóstico
- [ ] Executar:
  ```bash
  npm run diagnose:pages-admin
  ```
- [ ] Verificar:
  - [ ] `admin-auth-config`: ✅ reachable, status 200
  - [ ] `public-chat-config`: ✅ reachable, status 200

### Teste 4: Funcionalidade
- [ ] Abrir: https://hermidamaia.adv.br/interno/login
- [ ] Verificar:
  - [ ] Dashboard carrega sem erros
  - [ ] Widget de chat carrega (canto inferior direito)
  - [ ] Sem erros 404 no console (F12 → Console)

---

## 🐛 TROUBLESHOOTING

### Se ainda receber 404

- [ ] **Passo 1**: Limpar cache do navegador
  - [ ] Chrome/Edge: Ctrl+Shift+Delete
  - [ ] Firefox: Ctrl+Shift+Delete
  - [ ] Safari: Cmd+Shift+Delete

- [ ] **Passo 2**: Aguardar propagação de DNS
  - [ ] Esperar 2-5 minutos
  - [ ] Testar em navegador privado/incógnito

- [ ] **Passo 3**: Verificar build
  ```bash
  ls -la out/functions/api/admin-auth-config.js
  ls -la out/functions/api/public-chat-config.js
  ```

- [ ] **Passo 4**: Verificar deploy
  - [ ] Acessar Cloudflare Dashboard
  - [ ] Verificar status do deploy
  - [ ] Verificar logs de erro

- [ ] **Passo 5**: Consultar documentação
  - [ ] Ler `RELATORIO_FIX_AUTH_404.md`
  - [ ] Ler `GUIA_IMPLEMENTACAO_FIX_AUTH.md`

---

## 📊 DOCUMENTAÇÃO

- [ ] Ler: `RESUMO_EXECUTIVO.md`
- [ ] Ler: `RELATORIO_FIX_AUTH_404.md`
- [ ] Ler: `GUIA_IMPLEMENTACAO_FIX_AUTH.md`
- [ ] Ler: `DEPLOY_WORKFLOW_SEGURO.md`

---

## 📝 NOTAS E OBSERVAÇÕES

```
_________________________________________________________________

_________________________________________________________________

_________________________________________________________________

_________________________________________________________________
```

---

## 🎯 PRÓXIMOS PASSOS

### Imediato (Hoje)
- [ ] Implementar uma das 3 soluções
- [ ] Validar com os 4 testes
- [ ] Notificar equipe sobre sucesso

### Curto Prazo (Esta Semana)
- [ ] Adicionar verificação ao GitHub Actions
- [ ] Documentar no README do projeto
- [ ] Treinar equipe sobre novo fluxo

### Médio Prazo (Este Mês)
- [ ] Remover scripts `deploy_automatico.*` (se usar Opção 1)
- [ ] Implementar monitoramento de 404s
- [ ] Criar alertas para falhas de deploy

---

## ✅ ASSINATURA

**Implementado por**: _______________________  
**Data**: _______________________  
**Validado por**: _______________________  
**Data**: _______________________  

---

## 📞 SUPORTE

**Dúvidas?** Consulte:
- `RELATORIO_FIX_AUTH_404.md` - Análise técnica
- `GUIA_IMPLEMENTACAO_FIX_AUTH.md` - Guia detalhado
- `DEPLOY_WORKFLOW_SEGURO.md` - Documentação oficial

**Problemas?** Verifique:
- Logs do Cloudflare Dashboard
- Console do navegador (F12)
- Output do script de diagnóstico

---

**Status**: ✅ Pronto para implementação  
**Versão**: 1.0  
**Data**: 28 de Abril de 2026
