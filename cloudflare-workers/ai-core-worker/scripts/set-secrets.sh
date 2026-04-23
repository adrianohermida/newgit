#!/bin/bash
# HMADV ai-core — Configuração de secrets no Cloudflare Workers
# Executar: bash scripts/set-secrets.sh

set -e

WORKER_NAME="hmadv-ai-core"

echo "Configurando secrets para o Worker: $WORKER_NAME"
echo ""

# Verificar se wrangler está instalado
if ! command -v wrangler &> /dev/null; then
  echo "Instalando wrangler..."
  npm install -g wrangler
fi

# Configurar secrets (solicita o valor interativamente)
echo "=== OPENAI_API_KEY ==="
echo "Cole a chave OpenAI (ou pressione Enter para pular):"
read -s OPENAI_KEY
if [ -n "$OPENAI_KEY" ]; then
  echo "$OPENAI_KEY" | wrangler secret put OPENAI_API_KEY --name "$WORKER_NAME"
fi

echo "=== HUGGINGFACE_API_KEY ==="
echo "Cole a chave HuggingFace (ou pressione Enter para pular):"
read -s HF_KEY
if [ -n "$HF_KEY" ]; then
  echo "$HF_KEY" | wrangler secret put HUGGINGFACE_API_KEY --name "$WORKER_NAME"
fi

echo "=== SUPABASE_URL ==="
echo "Cole a URL do Supabase:"
read -s SUPA_URL
if [ -n "$SUPA_URL" ]; then
  echo "$SUPA_URL" | wrangler secret put SUPABASE_URL --name "$WORKER_NAME"
fi

echo "=== SUPABASE_SERVICE_ROLE_KEY ==="
echo "Cole a Service Role Key do Supabase:"
read -s SUPA_KEY
if [ -n "$SUPA_KEY" ]; then
  echo "$SUPA_KEY" | wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name "$WORKER_NAME"
fi

echo "=== HMADV_GATEWAY_SECRET ==="
echo "Cole o secret de autenticação do gateway (ou pressione Enter para gerar um):"
read -s GW_SECRET
if [ -z "$GW_SECRET" ]; then
  GW_SECRET=$(openssl rand -hex 32)
  echo "Secret gerado: $GW_SECRET"
  echo "(Salve este valor — será necessário para autenticar chamadas ao Worker)"
fi
echo "$GW_SECRET" | wrangler secret put HMADV_GATEWAY_SECRET --name "$WORKER_NAME"

echo ""
echo "✅ Secrets configurados com sucesso!"
echo "Execute 'wrangler deploy' para fazer o deploy do Worker."
