import { useEffect, useState } from 'react'
import { getProcessos } from '@/services/processos.service'

export function useProcessos(userId: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!userId) return
    getProcessos(userId).then(setData)
  }, [userId])

  return data
}
