import React from 'react';
import { Users, UserCheck } from 'lucide-react';

export default function PartesStats({ partes }) {
  const totalPartes = partes.length;
  const clienteIdentificado = partes.some(p => p.e_cliente_escritorio);

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1">
        <Users className="w-3 h-3 text-[var(--brand-text-tertiary)]" />
        <span className="text-[var(--brand-text-secondary)]">{totalPartes} parte(s)</span>
      </div>
      {clienteIdentificado && (
        <div className="flex items-center gap-1">
          <UserCheck className="w-3 h-3 text-[var(--brand-success)]" />
          <span className="text-[var(--brand-success)]">Cliente ID</span>
        </div>
      )}
    </div>
  );
}