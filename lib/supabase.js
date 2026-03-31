import { createClient } from '@supabase/supabase-js';

// Factory para uso em Cloudflare Workers (env injetado via context)
export function createSupabaseClient(url, key) {
  return createClient(url, key);
}

// Singleton para uso no frontend Next.js (process.env disponível em build time)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey);
}
