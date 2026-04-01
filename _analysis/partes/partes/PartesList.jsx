import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User } from 'lucide-react';

export default function PartesList({ partes }) {
  if (!partes || partes.length === 0) {
    return <div className="text-[var(--text-secondary)] text-sm">Nenhuma parte cadastrada</div>;
  }

  return (
    <Card className="border-[var(--border-primary)]">
      <CardHeader>
        <CardTitle className="text-[var(--text-primary)]">Partes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {partes.map((parte, idx) => (
          <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]">
            <User className="w-4 h-4 text-[var(--text-tertiary)] mt-1" />
            <div className="flex-1">
              <p className="font-medium text-[var(--text-primary)]">{parte.nome}</p>
              <Badge variant="outline" className="mt-1">{parte.tipo}</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}