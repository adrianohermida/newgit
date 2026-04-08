import { useEffect, useState } from 'react'
import { getDocumentos } from '@/services/documentos.service'

export function useDocumentos(userId: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!userId) return
    getDocumentos(userId).then(setData)
  }, [userId])

  return data
}
