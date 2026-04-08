import { useEffect, useState } from 'react'
import { getPublicacoes } from '@/services/publicacoes.service'

export function usePublicacoes(userId: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!userId) return
    getPublicacoes(userId).then(setData)
  }, [userId])

  return data
}
