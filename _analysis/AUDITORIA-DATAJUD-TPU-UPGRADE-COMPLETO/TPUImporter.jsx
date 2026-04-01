import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Upload, Database, Search, Loader2, CheckCircle, FileJson } from 'lucide-react';
import { toast } from 'sonner';

const ENTIDADES = [
  { key: 'TPUClasse',    label: 'Classes TPU',    entity: 'TPUClasse'    },
  { key: 'TPUAssunto',   label: 'Assuntos TPU',   entity: 'TPUAssunto'   },
  { key: 'TPUMovimento', label: 'Movimentos TPU',  entity: 'TPUMovimento' },
];

export default function TPUImporter() {
  const [selectedEntity, setSelectedEntity] = useState('TPUClasse');
  const [jsonText, setJsonText] = useState('');
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');

  // Counts por entidade
  const { data: classesCount = 0, refetch: refetchClasses } = useQuery({
    queryKey: ['tpu_count_classe'],
    queryFn: async () => { const d = await base44.entities.TPUClasse.filter({}, '-created_date', 1); return Array.isArray(d) ? d.length : 0; },
    refetchInterval: false,
  });
  const { data: assuntosCount = 0, refetch: refetchAssuntos } = useQuery({
    queryKey: ['tpu_count_assunto'],
    queryFn: async () => { const d = await base44.entities.TPUAssunto.filter({}, '-created_date', 1); return Array.isArray(d) ? d.length : 0; },
    refetchInterval: false,
  });
  const { data: movimentosCount = 0, refetch: refetchMovimentos } = useQuery({
    queryKey: ['tpu_count_movimento'],
    queryFn: async () => { const d = await base44.entities.TPUMovimento.filter({}, '-created_date', 1); return Array.isArray(d) ? d.length : 0; },
    refetchInterval: false,
  });

  const counts = { TPUClasse: classesCount, TPUAssunto: assuntosCount, TPUMovimento: movimentosCount };

  const handleImport = async () => {
    if (!jsonText.trim()) { toast.error('Cole o JSON com os itens TPU'); return; }
    let itens;
    try {
      const parsed = JSON.parse(jsonText);
      itens = Array.isArray(parsed) ? parsed : parsed.items || parsed.data || [parsed];
    } catch {
      toast.error('JSON inválido'); return;
    }
    if (!itens.length) { toast.error('Nenhum item encontrado no JSON'); return; }

    setImporting(true);
    try {
      const entityName = selectedEntity;
      const lote = 50;
      let total = 0;
      for (let i = 0; i < itens.length; i += lote) {
        const batch = itens.slice(i, i + lote);
        await base44.entities[entityName].bulkCreate(batch);
        total += batch.length;
      }
      setStats(s => ({ ...s, [entityName]: (s[entityName] || 0) + total }));
      toast.success(`${total} itens importados para ${entityName}`);
      setJsonText('');
      refetchClasses(); refetchAssuntos(); refetchMovimentos();
    } catch (err) {
      toast.error('Erro ao importar: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const placeholderJSON = JSON.stringify([
    { codigo: 11, nome: "Procedimento Comum", ativo: true },
    { codigo: 12, nome: "Procedimento Especial", ativo: true },
  ], null, 2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="w-4 h-4 text-blue-500" />
          Importar Tabelas TPU (CNJ)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status das entidades */}
        <div className="grid grid-cols-3 gap-3">
          {ENTIDADES.map(e => (
            <div
              key={e.key}
              onClick={() => setSelectedEntity(e.key)}
              className={`rounded-lg border p-3 cursor-pointer transition-all ${selectedEntity === e.key ? 'border-[#212373] bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <p className="text-xs text-slate-500">{e.label}</p>
              <p className="text-lg font-bold text-slate-900">{counts[e.key] ?? '—'}</p>
              {stats[e.key] ? (
                <Badge className="text-xs bg-green-100 text-green-700 border-green-200 mt-1">
                  +{stats[e.key]} importados
                </Badge>
              ) : null}
            </div>
          ))}
        </div>

        {/* Instruções */}
        <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Como importar:</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Acesse o DataJud ou CNJ e exporte a tabela TPU desejada em JSON</li>
            <li>Selecione a entidade acima (Classe, Assunto ou Movimento)</li>
            <li>Cole o JSON abaixo e clique em Importar</li>
          </ol>
          <p className="mt-1">Formato esperado: array de objetos com <code className="bg-blue-100 px-1 rounded">codigo</code> e <code className="bg-blue-100 px-1 rounded">nome</code></p>
        </div>

        {/* Editor JSON */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-600">
              JSON — {ENTIDADES.find(e => e.key === selectedEntity)?.label}
            </label>
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setJsonText(placeholderJSON)}>
              <FileJson className="w-3 h-3 mr-1" /> Exemplo
            </Button>
          </div>
          <textarea
            className="w-full h-40 font-mono text-xs border border-slate-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#212373]/30"
            placeholder={`Cole aqui o JSON com itens ${ENTIDADES.find(e => e.key === selectedEntity)?.label}...`}
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
          />
        </div>

        <Button
          onClick={handleImport}
          disabled={importing || !jsonText.trim()}
          className="bg-[#212373] hover:bg-[#1a1b5e] w-full"
        >
          {importing
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
            : <><Upload className="w-4 h-4 mr-2" />Importar para {ENTIDADES.find(e => e.key === selectedEntity)?.label}</>}
        </Button>
      </CardContent>
    </Card>
  );
}