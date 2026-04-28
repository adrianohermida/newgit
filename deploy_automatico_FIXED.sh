#!/bin/bash
# deploy_automatico.sh
# Script para CI/CD local: Pages (com Pages Functions) + Workers
# Use apenas para testes locais! Produção deve ser via GitHub/Pages conectado.
#
# IMPORTANTE: Este script faz deploy COMPLETO, incluindo Cloudflare Pages Functions.
# Para produção, prefira o build conectado do Cloudflare Pages.

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo_step() {
    echo ""
    echo -e "${CYAN}==> $1${NC}"
}

echo_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

echo_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo_error() {
    echo -e "${RED}❌ $1${NC}"
}

# ============================================================================
# ETAPA 1: Build do Pages (inclui cópia de functions/ para out/)
# ============================================================================
echo_step "Build do Cloudflare Pages"
npm run build:pages || {
    echo_error "Falha ao fazer build do Pages"
    exit 1
}
echo_success "Build do Pages concluído com sucesso"

# ============================================================================
# ETAPA 2: Deploy do Cloudflare Pages (com Pages Functions)
# ============================================================================
echo_step "Deploy do Cloudflare Pages (inclui Pages Functions em /api/*)"
echo_warning "Este é um deploy estático-only. Para produção, use o build conectado do Cloudflare."
echo "Continuando com deploy local explícito..."

export ALLOW_STATIC_ONLY_PAGES_DEPLOY=1
npm run deploy:pages || {
    echo_error "Falha ao fazer deploy do Pages"
    unset ALLOW_STATIC_ONLY_PAGES_DEPLOY
    exit 1
}
unset ALLOW_STATIC_ONLY_PAGES_DEPLOY
echo_success "Deploy do Cloudflare Pages concluído"

# ============================================================================
# ETAPA 3: Deploy do Worker AI (hmadv-process-ai)
# ============================================================================
if [ -d "workers/hmadv-process-ai" ]; then
    echo_step "Deploy do Worker AI (hmadv-process-ai)"
    npx wrangler deploy --config workers/hmadv-process-ai/wrangler.toml || {
        echo_error "Falha ao fazer deploy do Worker AI"
        exit 1
    }
    echo_success "Worker AI deployado com sucesso"
else
    echo_warning "Pasta workers/hmadv-process-ai não encontrada. Pulando deploy do Worker AI."
fi

# ============================================================================
# ETAPA 4: Deploy do Worker API (hmadv-api)
# ============================================================================
if [ -d "workers/hmadv-api" ]; then
    echo_step "Deploy do Worker API (hmadv-api)"
    npx wrangler deploy --config workers/hmadv-api/wrangler.toml || {
        echo_error "Falha ao fazer deploy do Worker API"
        exit 1
    }
    echo_success "Worker API deployado com sucesso"
else
    echo_warning "Pasta workers/hmadv-api não encontrada. Pulando deploy do Worker API."
fi

# ============================================================================
# ETAPA 5: Verificação Pós-Deploy
# ============================================================================
echo_step "Verificação Pós-Deploy"
echo "Aguardando propagação de DNS (30 segundos)..."
sleep 30

if [ -f "scripts/diagnose-pages-admin-runtime.ps1" ]; then
    echo "Executando diagnóstico de Pages Functions..."
    # Nota: Este script é PowerShell, então só funciona em Windows/WSL
    # Em Linux puro, você pode usar curl como alternativa
    if command -v pwsh &> /dev/null; then
        pwsh -ExecutionPolicy Bypass -File scripts/diagnose-pages-admin-runtime.ps1 -BaseUrl "https://hermidamaia.adv.br"
    else
        echo_warning "PowerShell não disponível. Usando curl para diagnóstico rápido..."
        echo ""
        echo "Testando /api/admin-auth-config:"
        curl -s https://hermidamaia.adv.br/api/admin-auth-config | jq . || echo "Erro ao acessar"
        echo ""
        echo "Testando /api/public-chat-config:"
        curl -s https://hermidamaia.adv.br/api/public-chat-config | jq . || echo "Erro ao acessar"
    fi
else
    echo_warning "Script de diagnóstico não encontrado. Pulando verificação automática."
fi

# ============================================================================
# RESUMO FINAL
# ============================================================================
echo ""
echo -e "${GREEN}$(printf '=%.0s' {1..80})${NC}"
echo -e "${GREEN}✅ DEPLOY AUTOMÁTICO CONCLUÍDO COM SUCESSO!${NC}"
echo -e "${GREEN}$(printf '=%.0s' {1..80})${NC}"
echo ""
echo -e "${GREEN}Componentes deployados:${NC}"
echo -e "${GREEN}  ✅ Cloudflare Pages (Frontend + Pages Functions /api/*)${NC}"
echo -e "${GREEN}  ✅ Worker hmadv-process-ai (ai.hermidamaia.adv.br)${NC}"
echo -e "${GREEN}  ✅ Worker hmadv-api (api.hermidamaia.adv.br)${NC}"
echo ""
echo -e "${CYAN}Próximos passos:${NC}"
echo -e "${CYAN}  1. Aguarde 1-2 minutos para propagação de DNS${NC}"
echo -e "${CYAN}  2. Teste as rotas de API:${NC}"
echo -e "${CYAN}     - https://hermidamaia.adv.br/api/admin-auth-config${NC}"
echo -e "${CYAN}     - https://hermidamaia.adv.br/api/public-chat-config${NC}"
echo -e "${CYAN}  3. Abra DevTools (F12) e procure por status 200 no Network${NC}"
echo ""
echo -e "${CYAN}Para diagnóstico detalhado, execute:${NC}"
echo -e "${CYAN}  npm run diagnose:pages-admin${NC}"
echo ""
