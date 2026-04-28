/**
 * Handler de cron jobs do Worker hmadv-api.
 * Executa tarefas agendadas: limpeza de agendamentos expirados, sincronização diária.
 */

import type { Env } from '../env.d';
import { getSupabaseBaseUrl, getSupabaseServiceKey } from '../lib/env';

export async function handleCron(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const cron = event.cron;
  console.log(`[hmadv-api] cron disparado: ${cron}`);

  // 0 7 * * * — sincronização diária matinal
  if (cron === '0 7 * * *') {
    await runDailySync(env);
    return;
  }

  // 0 */6 * * * — limpeza de agendamentos expirados a cada 6h
  if (cron === '0 */6 * * *') {
    await cleanExpiredAgendamentos(env);
    return;
  }

  console.warn(`[hmadv-api] cron não reconhecido: ${cron}`);
}

async function runDailySync(env: Env): Promise<void> {
  const supabaseUrl = getSupabaseBaseUrl(env);
  const serviceKey = getSupabaseServiceKey(env);
  if (!supabaseUrl || !serviceKey) {
    console.warn('[hmadv-api] cron daily-sync: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.');
    return;
  }
  console.log('[hmadv-api] cron daily-sync: iniciando sincronização diária.');
  // Ponto de extensão — adicionar lógica de sync aqui
}

async function cleanExpiredAgendamentos(env: Env): Promise<void> {
  const supabaseUrl = getSupabaseBaseUrl(env);
  const serviceKey = getSupabaseServiceKey(env);
  if (!supabaseUrl || !serviceKey) {
    console.warn('[hmadv-api] cron clean-expired: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.');
    return;
  }
  // Remove agendamentos com status 'pendente' criados há mais de 48h
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/agendamentos?status=eq.pendente&created_at=lt.${cutoff}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
      }
    );
    if (res.ok) {
      console.log('[hmadv-api] cron clean-expired: agendamentos expirados removidos.');
    } else {
      console.error('[hmadv-api] cron clean-expired: erro ao remover agendamentos.', res.status);
    }
  } catch (err) {
    console.error('[hmadv-api] cron clean-expired: exceção.', err);
  }
}
