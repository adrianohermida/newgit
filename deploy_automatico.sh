#!/bin/bash
# deploy_automatico.sh
# Script para CI/CD local: Pages + Worker AI
# Use apenas para testes locais! Produção deve ser via GitHub/Pages conectado.

set -e

# 1. Build do frontend + funções
npm run build:pages

echo "Build do Pages concluído."

# 2. Deploy do Worker AI (hmadv-process-ai)
if [ -d "workers/hmadv-process-ai" ]; then
  echo "Deployando Worker AI..."
  cd workers/hmadv-process-ai
  wrangler deploy
  cd -
else
  echo "Pasta workers/hmadv-process-ai não encontrada. Pulei deploy do Worker AI."
fi

echo "Script de deploy automático local concluído."
