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
  echo "Deployando Worker AI (hmadv-process-ai)..."
  npx wrangler deploy --config workers/hmadv-process-ai/wrangler.toml
else
  echo "Pasta workers/hmadv-process-ai não encontrada. Pulei deploy do Worker AI."
fi

# 3. Deploy do Worker API (hmadv-api) — se existir
if [ -d "workers/hmadv-api" ]; then
  echo "Deployando Worker API (hmadv-api)..."
  npx wrangler deploy --config workers/hmadv-api/wrangler.toml
else
  echo "Pasta workers/hmadv-api não encontrada. Pulei deploy do Worker API."
fi

echo "Script de deploy automático local concluído."
