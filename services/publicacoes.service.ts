import { supabase } from '@/lib/supabaseClient'

export async function getPublicacoes(userId: string) {
  const { data, error } = await supabase
    .from('publicacoes')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error
  return data
}
