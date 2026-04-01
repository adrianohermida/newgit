import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Upload, Loader2, MapPin, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function ServentiasCSVImporter() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['serventia-stats'],
    queryFn: async () => {
      const total = await base44.entities.Serventia.filter({});
      return {
        total: total.length,
        estados: [...new Set(total.map(s => s.uf))].length,
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

      setStatus(`Processando ${totalLinhas.toLocaleString('pt-BR')} serventias...`);

      const CHUNK_SIZE = 500;
      const totalChunks = Math.ceil(totalLinhas / CHUNK_SIZE);
      let processados = 0;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min((i + 1) * CHUNK_SIZE, totalLinhas);
        const chunk = [linhas[0], ...linhas.slice(start + 1, end + 1)].join('\n');

        setStatus(`Lote ${i + 1}/${totalChunks}`);
        setProgress(Math.round((i / totalChunks) * 100));

        const { data } = await base44.functions.invoke('importarServentias', {
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
      toast.success(`✓ ${data.processados} serventias importadas`);
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
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Serventias</p>
            <p className="text-xl font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-600">Estados</p>
            <p className="text-xl font-bold text-blue-700">{stats.estados}</p>
          </div>
        </div>
      )}

      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-3 text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          Arquivos grandes processados em lotes de 500 linhas. Não feche a página durante importação.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="w-4 h-4 text-green-600" />
            Importar Serventias
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
              Formato: tribunal,uf,municipio,numero_serventia,nome_serventia,telefone,email,endereco
            </p>
          </div>

          {file && (
            <div className="bg-green-50 rounded-lg p-3 text-xs">
              <CheckCircle className="w-4 h-4 inline text-green-600 mr-2" />
              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
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
            className="w-full bg-green-600 hover:bg-green-700"
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