import { supabase } from '@/lib/supabaseClient'

export async function getFinanceiro(userId: string) {
  const { data, error } = await supabase
    .from('financeiro')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error
  return data
}
