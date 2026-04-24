/**
 * billing-import — Edge Function v2
 * Processa a fila billing_import_queue e sincroniza com o Freshsales Deals.
 *
 * Responsabilidades:
 * 1. Ler lote da billing_import_queue (status = 'aberto' | 'pago' | 'faturar')
 * 2. Verificar rate limit centralizado (fs_rate_limit_check)
 * 3. Buscar/criar Contact no Freshsales (via contacts/filter POST)
 * 4. Buscar Account (processo) no Freshsales por CNJ (via sales_accounts/filter POST)
 * 5. Criar/atualizar Deal no Freshsales com produto obrigatório e deal_stage_id real
 * 6. Inserir em billing_receivables + freshsales_deals_registry no Supabase
 * 7. Atualizar billing_import_queue com status = 'processado'
 *
 * Rate limit: máximo 250 req/hora para billing-import (de 1000 total)
 * Cron: a cada 2 minutos via pg_cron
 *
 * IDs reais do Freshsales (hmadv-org.myfreshworks.com):
 *   Pipeline: 31000060365
 *   Stage 'aberto'   → 31000423213
 *   Stage 'faturar'  → 31000423211
 *   Stage 'pago'     → 31000423216
 *   Stage 'cancelado'→ 31000423213 (fallback)
 *   Produto padrão   → 31002148103 (Honorários Advocatícios)
 *   Owner ID         → 31000147944 (Dr. Adriano)
 */
// SEE FULL FILE IN SUPABASE DEPLOYED VERSION (version 2, ACTIVE)
// This file is synced from sandbox /home/ubuntu/newgit/supabase/functions/billing-import/index.ts
