// TASKS TOOL - CRUD real de tarefas (exemplo Supabase)
import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient(env: any) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function listTasks(env: any, userId: string) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTask(env: any, userId: string, title: string) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ user_id: userId, title }])
    .select();
  if (error) throw error;
  return data?.[0];
}
