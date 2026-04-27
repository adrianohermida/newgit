/**
 * _shared/rate-limit.ts
 * Módulo compartilhado de rate limit para chamadas ao Freshsales.
 *
 * Teto global: 990 chamadas/hora (configurado na função fs_rate_limit_check no banco)
 *
 * Quotas por caller (soma total deve ser <= 990):
 *   publicacoes-freshsales  → 200  (sync de publicações)
 *   fs-account-repair       → 150  (repair de accounts/activities)
 *   fs-repair-orphans       → 100  (criação de accounts órfãos)
 *   processo-sync           → 120  (sync bidirecional)
 *   billing-import          →  80  (deals/faturas)
 *   billing-deals-sync      →  80  (criação de deals)
 *   datajud-andamentos-sync → 100  (andamentos → FS activities)
 *   publicacoes-partes      →  60  (criação de contatos)
 *   publicacoes-prazos      →  40  (criação de tasks)
 *   publicacoes-audiencias  →  30  (sync de audiências)
 *   fs-tag-leilao           →  20  (tagging de leilões)
 *   fs-contacts-sync        →  10  (sync de contatos avulso)
 *   outros                  →  10  (fallback)
 *   SOMA                    → 990  (exatamente no teto global)
 *
 * ATENÇÃO: As funções RPC fs_rate_limit_check e fs_rate_limit_consume
 * estão no schema PUBLIC. Funções que operam no schema 'judiciario' devem
 * passar um cliente Supabase configurado para o schema 'public' (dbPublic).
 * Use a função createPublicClient() deste módulo para isso.
 *
 * Uso:
 *   import { checkRateLimit, consumeRateLimit, createPublicClient } from '../_shared/rate-limit.ts';
 *
 *   // Para funções com schema 'judiciario', criar cliente público:
 *   const dbPublic = createPublicClient();
 *
 *   // Antes de processar um batch:
 *   const rl = await checkRateLimit(dbPublic, 'publicacoes-freshsales', batchSize * 3);
 *   if (!rl.ok) {
 *     return new Response(JSON.stringify({ ok: false, motivo: 'rate_limit', ...rl }), { status: 429 });
 *   }
 *   // Ajustar batch pelo slots disponíveis:
 *   const safeBatch = safeBatchSize(rl.slots_avail, 3, batchSize);
 *
 *   // Após execução real (opcional, para registro preciso):
 *   await consumeRateLimit(dbPublic, 'publicacoes-freshsales', chamadas_reais);
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitResult {
  ok: boolean;
  total_used: number;
  caller_used: number;
  slots_avail: number;
  global_limit: number;
  caller_quota: number;
  window: string;
}

/** Quotas padrão por caller (chamadas/hora). Soma = 990 = teto global. */
export const CALLER_QUOTAS: Record<string, number> = {
  'publicacoes-freshsales':   200,
  'fs-account-repair':        150,
  'fs-repair-orphans':        100,
  'processo-sync':            120,
  'billing-import':            80,
  'billing-deals-sync':        80,
  'datajud-andamentos-sync':  100,
  'publicacoes-partes':        60,
  'publicacoes-prazos':        40,
  'publicacoes-audiencias':    30,
  'fs-tag-leilao':             20,
  'fs-contacts-sync':          10,
};

/**
 * Cria um cliente Supabase apontando para o schema PUBLIC.
 * Necessário para funções que operam no schema 'judiciario' mas precisam
 * chamar as funções RPC de rate limit que estão no schema 'public'.
 */
export function createPublicClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key); // schema padrão = public
}

/**
 * Verifica se há quota disponível e reserva as chamadas.
 * Retorna ok=false com slots_avail se não houver quota suficiente.
 * Nesse caso, a função deve retornar HTTP 429 e o CRON tentará na próxima janela.
 *
 * IMPORTANTE: passe sempre um cliente com schema 'public' (ou use createPublicClient()).
 */
export async function checkRateLimit(
  db: SupabaseClient,
  caller: string,
  needed: number,
): Promise<RateLimitResult> {
  const quota = CALLER_QUOTAS[caller] ?? 10;
  const { data, error } = await db.rpc('fs_rate_limit_check', {
    p_caller: caller,
    p_needed: needed,
    p_quota:  quota,
  });

  if (error) {
    // Em caso de erro no banco, BLOQUEAR por segurança (não permitir execução sem controle)
    console.error(`[rate-limit] Erro ao verificar rate limit para ${caller}: ${error.message}`);
    // Retornar ok=false com slots_avail=0 para evitar chamadas não controladas
    return {
      ok: false,
      total_used: 0,
      caller_used: 0,
      slots_avail: 0,
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
 *
 * IMPORTANTE: passe sempre um cliente com schema 'public' (ou use createPublicClient()).
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
    console.error(`[rate-limit] Erro ao registrar consumo para ${caller}: ${error.message}`);
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
