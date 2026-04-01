import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, Loader2, Database, FileSpreadsheet, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function JuizoCNJCSVImporter() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['juizo-cnj-stats'],
    queryFn: async () => {
      const total = await base44.entities.JuizoCNJ.filter({});
      const digitais = total.filter(j => j.juizo_100_digital);
      return {
        total: total.length,
        digitais: digitais.length,
        tribunais: [...new Set(total.map(j => j.tribunal))].length,
      };
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Nenhum arquivo selecionado');
      setStatus('Lendo arquivo...');

      const text = await file.text();
      const linhas = text.split('\n');
      const totalLinhas = linhas.length - 1;

      setStatus(`Processando ${totalLinhas.toLocaleString('pt-BR')} juízos...`);

      const CHUNK_SIZE = 500;
      const totalChunks = Math.ceil(totalLinhas / CHUNK_SIZE);
      let processados = 0;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min((i + 1) * CHUNK_SIZE, totalLinhas);
        const chunk = [linhas[0], ...linhas.slice(start + 1, end + 1)].join('\n');

        setStatus(`Lote ${i + 1}/${totalChunks}`);
        setProgress(Math.round((i / totalChunks) * 100));

        const { data } = await base44.functions.invoke('importarJuizoCNJ', {
          csv_content: chunk,
          batch_number: i + 1,
          total_batches: totalChunks,
        });

        processados += data.importados || 0;
        await new Promise(r => setTimeout(r, 100));
      }

      setProgress(100);
      setStatus('Concluído!');
      return { processados, total: totalLinhas };
    },
    onSuccess: (data) => {
      toast.success(`✓ ${data.processados} juízos importados`);
      setFile(null);
      setProgress(0);
      setStatus('');
    },
    onError: (err) => {
      toast.error('Erro: ' + err.message);
      setProgress(0);
      setStatus('');
    },
  });

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-xl font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-green-600">100% Digital</p>
            <p className="text-xl font-bold text-green-700">{stats.digitais}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-600">Tribunais</p>
            <p className="text-xl font-bold text-blue-700">{stats.tribunais}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-4 h-4 text-blue-600" />
            Importar Juízos CNJ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Arquivo CSV</Label>
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0])}
              disabled={importMutation.isPending}
              className="mt-2"
            />
            <p className="text-xs text-slate-500 mt-1">
              Formato: tribunal,uf,numero_serventia,nome_serventia,codigo_origem,unidade,tipo_unidade,juizo_100_digital
            </p>
          </div>

          {file && (
            <div className="bg-blue-50 rounded-lg p-3 text-xs">
              <CheckCircle className="w-4 h-4 inline text-green-600 mr-2" />
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}

          {importMutation.isPending && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">{status}</span>
                <span className="text-slate-900 font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button
            onClick={() => importMutation.mutate()}
            disabled={!file || importMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}