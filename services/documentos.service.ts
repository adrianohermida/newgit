import { supabase } from '@/lib/supabaseClient'

export async function getDocumentos(userId: string) {
  const { data, error } = await supabase
    .from('documentos')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error
  return data
}
