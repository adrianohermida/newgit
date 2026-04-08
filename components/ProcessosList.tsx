import React from 'react'
import { useProcessos } from '@/hooks/useProcessos'

export function ProcessosList({ userId }: { userId: string }) {
  const processos = useProcessos(userId)

  if (!processos.length) return <div>Carregando processos...</div>

  return (
    <div>
      {processos.map((p: any) => (
        <div key={p.id} style={{ borderBottom: '1px solid #ccc', padding: 8 }}>
          <strong>{p.numero}</strong>
        </div>
      ))}
    </div>
  )
}
