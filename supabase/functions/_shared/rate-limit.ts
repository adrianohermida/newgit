/**
 * _shared/rate-limit.ts
 * Módulo compartilhado de rate limit para chamadas ao Freshsales.
 *
 * Teto global: 990 chamadas/hora (configurado na função fs_rate_limit_check no banco)
 *
 * Quotas por caller (soma total deve ser <= 990):
 *   publicacoes-freshsales  → 300  (maior fila, prioridade máxima)
 *   fs-account-repair       → 200  (repair de accounts/activities)
 *   fs-repair-orphans       → 150  (criação de accounts órfãos)
 *   processo-sync           → 120  (sync bidirecional)
 *   billing-import          → 100  (deals/faturas)
 *   datajud-andamentos-sync →  60  (andamentos → FS activities)
 *   fs-tag-leilao           →  40  (tagging de leilões)
 *   outros                  →  20  (fallback)
 *
 * Uso:
 *   import { checkRateLimit, consumeRateLimit } from '../_shared/rate-limit.ts';
 *
 *   // Antes de processar um batch:
 *   const rl = await checkRateLimit(db, 'publicacoes-freshsales', batchSize * 3);
 *   if (!rl.ok) {
 *     return new Response(JSON.stringify({ ok: false, motivo: 'rate_limit', ...rl }), { status: 429 });
 *   }
 *   // Ajustar batch pelo slots disponíveis:
 *   const safeBatch = Math.min(batchSize, Math.floor(rl.slots_avail / 3));
 *
 *   // Após execução real (opcional, para registro preciso):
 *   await consumeRateLimit(db, 'publicacoes-freshsales', chamadas_reais);
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitResult {
  ok: boolean;
  total_used: number;
  caller_used: number;
  slots_avail: number;
  global_limit: number;
  caller_quota: number;
  window: string;
}

/** Quotas padrão por caller (chamadas/hora) */
export const CALLER_QUOTAS: Record<string, number> = {
  'publicacoes-freshsales':   300,
  'fs-account-repair':        200,
  'fs-repair-orphans':        150,
  'processo-sync':            150,
  'billing-import':           100,
  'datajud-andamentos-sync':  150,
  'publicacoes-partes':       100,
  'publicacoes-prazos':        60,
  'publicacoes-audiencias':    40,
  'fs-tag-leilao':             40,
};

/**
 * Verifica se há quota disponível e reserva as chamadas.
 * Retorna ok=false com slots_avail se não houver quota suficiente.
 * Nesse caso, a função deve retornar HTTP 429 e o CRON tentará na próxima janela.
 */
export async function checkRateLimit(
  db: SupabaseClient,
  caller: string,
  needed: number,
): Promise<RateLimitResult> {
  const quota = CALLER_QUOTAS[caller] ?? 20;
  const { data, error } = await db.rpc('fs_rate_limit_check', {
    p_caller: caller,
    p_needed: needed,
    p_quota:  quota,
  });

  if (error) {
    // Em caso de erro no banco, permitir execução mas logar
    console.error(`[rate-limit] Erro ao verificar rate limit: ${error.message}`);
    return {
      ok: true,
      total_used: 0,
      caller_used: 0,
      slots_avail: quota,
      global_limit: 990,
      caller_quota: quota,
      window: new Date().toISOString(),
    };
  }

  return data as RateLimitResult;
}

/**
 * Registra chamadas realizadas APÓS a execução (mais preciso que a reserva prévia).
 * Use quando o número real de chamadas pode diferir do estimado.
 */
export async function consumeRateLimit(
  db: SupabaseClient,
  caller: string,
  consumed: number,
): Promise<void> {
  if (consumed <= 0) return;
  const { error } = await db.rpc('fs_rate_limit_consume', {
    p_caller:   caller,
    p_consumed: consumed,
  });
  if (error) {
    console.error(`[rate-limit] Erro ao registrar consumo: ${error.message}`);
  }
}

/**
 * Calcula o batch size seguro baseado nos slots disponíveis e chamadas por item.
 * @param slotsAvail   Slots disponíveis retornados por checkRateLimit
 * @param callsPerItem Número de chamadas ao FS por item processado
 * @param maxBatch     Batch máximo configurado na função
 */
export function safeBatchSize(
  slotsAvail: number,
  callsPerItem: number,
  maxBatch: number,
): number {
  if (callsPerItem <= 0) return maxBatch;
  return Math.max(1, Math.min(maxBatch, Math.floor(slotsAvail / callsPerItem)));
}
