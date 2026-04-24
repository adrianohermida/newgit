/**
 * app-config.ts — Helper para leitura de configurações do projeto HMADV
 *
 * Estratégia de leitura (em ordem de prioridade):
 *   1. Deno.env.get(key)         — secrets do app (sensíveis e rotativos)
 *   2. config.app_config (banco) — configurações estáticas migradas
 *
 * Isso permite:
 *   - Manter tokens OAuth e API keys sensíveis nos app secrets
 *   - Armazenar configurações estáticas no banco (sem ocupar slots de secrets)
 *   - Atualizar configurações estáticas sem redeploy das edge functions
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cache em memória para evitar múltiplas queries por execução
const _cache: Record<string, string> = {};
let _cacheLoaded = false;

// Cliente Supabase para leitura da app_config
let _db: SupabaseClient | null = null;

function getDb(): SupabaseClient {
  if (!_db) {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    _db = createClient(url, key, { db: { schema: 'config' } });
  }
  return _db;
}

/**
 * Pré-carrega todas as configurações da tabela app_config em memória.
 * Deve ser chamado no início da edge function para minimizar queries.
 */
export async function preloadConfigs(): Promise<void> {
  if (_cacheLoaded) return;
  try {
    const db = getDb();
    const { data, error } = await db
      .from('app_config')
      .select('key, value')
      .not('value', 'is', null);

    if (!error && data) {
      for (const row of data) {
        if (row.value !== null && row.value !== undefined) {
          _cache[row.key] = row.value;
        }
      }
    }
    _cacheLoaded = true;
  } catch (e) {
    // Falha silenciosa — fallback para Deno.env.get()
    console.warn('[app-config] Falha ao carregar app_config do banco:', e);
    _cacheLoaded = true;
  }
}

/**
 * Obtém uma configuração com fallback automático:
 *   1. Deno.env.get(key) — secrets do app (prioridade máxima)
 *   2. Cache da app_config (banco)
 *   3. defaultValue
 */
export function getConfig(key: string, defaultValue?: string): string | undefined {
  // 1. Tentar Deno.env primeiro (secrets sensíveis e rotativos)
  const envVal = Deno.env.get(key);
  if (envVal !== undefined && envVal.trim() !== '') return envVal.trim();

  // 2. Tentar cache da app_config
  const cacheVal = _cache[key];
  if (cacheVal !== undefined && cacheVal.trim() !== '') return cacheVal.trim();

  // 3. Default
  return defaultValue;
}

/**
 * Obtém uma configuração obrigatória. Lança erro se não encontrada.
 */
export function requireConfig(key: string): string {
  const val = getConfig(key);
  if (!val) throw new Error(`[app-config] Configuração obrigatória não encontrada: ${key}`);
  return val;
}

/**
 * Atualiza um valor na tabela app_config (para configs dinâmicas como tokens OAuth).
 * Não afeta os app secrets do Supabase.
 */
export async function setConfig(
  key: string,
  value: string,
  category = 'general',
  description?: string
): Promise<void> {
  const db = getDb();
  await db.from('app_config').upsert({
    key,
    value,
    category,
    description,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  // Atualizar cache local
  _cache[key] = value;
}

/**
 * Atualiza múltiplos valores de uma vez (batch upsert).
 */
export async function setConfigs(
  configs: Array<{ key: string; value: string; category?: string; description?: string }>
): Promise<void> {
  const db = getDb();
  const rows = configs.map(c => ({
    key: c.key,
    value: c.value,
    category: c.category ?? 'general',
    description: c.description,
    updated_at: new Date().toISOString(),
  }));
  await db.from('app_config').upsert(rows, { onConflict: 'key' });
  for (const c of configs) _cache[c.key] = c.value;
}

// Exportar instância singleton para uso direto
export const appConfig = {
  preload: preloadConfigs,
  get: getConfig,
  require: requireConfig,
  set: setConfig,
  setMany: setConfigs,
};

export default appConfig;
