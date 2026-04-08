import { supabase } from '@/lib/supabaseClient'

export async function getProcessos(userId: string) {
  const { data, error } = await supabase
    .from('processos_view')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error
  return data
}
