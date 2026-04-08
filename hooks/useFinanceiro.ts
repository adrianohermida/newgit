import { useEffect, useState } from 'react'
import { getFinanceiro } from '@/services/financeiro.service'

export function useFinanceiro(userId: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!userId) return
    getFinanceiro(userId).then(setData)
  }, [userId])

  return data
}
