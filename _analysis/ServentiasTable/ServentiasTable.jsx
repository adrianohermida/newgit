import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2 } from 'lucide-react';

export default function ServentiasTable() {
  const [search, setSearch] = useState('');

  const { data: serventias = [], isLoading } = useQuery({
    queryKey: ['serventiascnj'],
    queryFn: () => base44.entities.ServentiaCNJ.list()
  });

  const filtered = serventias.filter(s => 
    !search || 
    s.nome_serventia?.toLowerCase().includes(search.toLowerCase()) ||
    s.municipio?.toLowerCase().includes(search.toLowerCase()) ||
    s.tribunal?.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Serventias CNJ</CardTitle>
          <Badge variant="outline">{serventias.length} registros</Badge>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome, município ou tribunal..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tribunal</TableHead>
                <TableHead>UF</TableHead>
                <TableHead>Município</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Nome Serventia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.tribunal}</TableCell>
                  <TableCell>{s.uf}</TableCell>
                  <TableCell>{s.municipio}</TableCell>
                  <TableCell>{s.numero_serventia || '-'}</TableCell>
                  <TableCell>{s.nome_serventia}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}