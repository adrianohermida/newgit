import React, { useState } from 'react';
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function ServentiasCSVImporter({ darkMode = true }) {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const queryClient = useQueryClient();

  const theme = {
    bg: darkMode ? 'bg-[#1E293B]' : 'bg-white',
    cardBg: darkMode ? 'bg-[#334155]' : 'bg-slate-50',
    border: darkMode ? 'border-[#475569]' : 'border-slate-200',
    text: darkMode ? 'text-white' : 'text-slate-900',
    textMuted: darkMode ? 'text-slate-400' : 'text-slate-500',
  };

  const parseFileMutation = useMutation({
    mutationFn: async (uploadedFile) => {
      const uploadResult = await base44.integrations.Core.UploadFile({ file: uploadedFile });
      
      const extractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: uploadResult.file_url,
        json_schema: {
          type: 'object',
          properties: {
            serventias: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tribunal: { type: 'string' },
                  uf: { type: 'string' },
                  municipio: { type: 'string' },
                  numero_serventia: { type: 'string' },
                  nome_serventia: { type: 'string' },
                  tipo_orgao: { type: 'string' },
                  competencia: { type: 'string' },
                  telefone: { type: 'string' },
                  email: { type: 'string' },
                  endereco: { type: 'string' },
                  cep: { type: 'string' }
                }
              }
            }
          }
        }
      });

      return extractResult.output?.serventias || [];
    },
    onSuccess: (data) => {
      setParsedData(data);
      toast.success(`${data.length} serventias extraídas`);
    },
    onError: (err) => {
      toast.error('Erro ao analisar arquivo: ' + err.message);
    }
  });

  const importMutation = useMutation({
    mutationFn: async (serventias) => {
      setImporting(true);
      setProgress({ current: 0, total: serventias.length });

      const batchSize = 50;
      let imported = 0;
      let errors = 0;

      for (let i = 0; i < serventias.length; i += batchSize) {
        const batch = serventias.slice(i, i + batchSize);
        
        try {
          await base44.entities.ServentiaCNJ.bulkCreate(batch);
          imported += batch.length;
        } catch (err) {
          errors += batch.length;
        }

        setProgress({ current: i + batch.length, total: serventias.length });
      }

      return { imported, errors, total: serventias.length };
    },
    onSuccess: (result) => {
      setImporting(false);
      queryClient.invalidateQueries(['serventias-cnj']);
      toast.success(`${result.imported} serventias importadas${result.errors > 0 ? `, ${result.errors} erros` : ''}`);
      setFile(null);
      setParsedData(null);
    },
    onError: (err) => {
      setImporting(false);
      toast.error('Erro na importação: ' + err.message);
    }
  });

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      parseFileMutation.mutate(selected);
    }
  };

  const downloadTemplate = () => {
    const csv = [
      'tribunal,uf,municipio,numero_serventia,nome_serventia,tipo_orgao,competencia,telefone,email,endereco,cep',
      'TJSP,SP,São Paulo,0001,1ª Vara Cível,Vara,Cível,(11) 1111-1111,vara1@tjsp.jus.br,Rua Exemplo 123,01000-000',
      'TJRJ,RJ,Rio de Janeiro,0002,2ª Vara Criminal,Vara,Criminal,(21) 2222-2222,vara2@tjrj.jus.br,Av Exemplo 456,20000-000'
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_serventias.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Template baixado');
  };

  return (
    <div className="space-y-4">
      <div className={`p-6 rounded-xl ${theme.cardBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-500" />
            <h3 className={`font-semibold ${theme.text}`}>Importar Serventias CNJ</h3>
          </div>
          <Button size="sm" variant="outline" onClick={downloadTemplate} className="rounded-lg">
            <Download className="w-4 h-4 mr-1" />
            Template CSV
          </Button>
        </div>

        {!parsedData ? (
          <div className="space-y-4">
            <div className={`border-2 border-dashed rounded-xl p-8 text-center ${theme.border}`}>
              <Upload className={`w-12 h-12 mx-auto mb-3 ${theme.textMuted}`} />
              <p className={`font-medium mb-2 ${theme.text}`}>
                Selecione arquivo CSV
              </p>
              <p className={`text-sm mb-4 ${theme.textMuted}`}>
                Tabela oficial CNJ com dados de serventias/varas
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="serventia-upload"
              />
              <label htmlFor="serventia-upload">
                <Button as="span" className="rounded-lg cursor-pointer" disabled={parseFileMutation.isPending}>
                  {parseFileMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Analisando...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-1" />Selecionar Arquivo</>
                  )}
                </Button>
              </label>
            </div>

            <div className={`p-4 rounded-lg ${theme.bg} border ${theme.border}`}>
              <p className={`text-sm ${theme.textMuted}`}>
                <strong>Formato esperado:</strong> tribunal, uf, municipio, numero_serventia, nome_serventia
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-green-500">
                <CheckCircle className="w-3 h-3 mr-1" />
                {parsedData.length} serventias encontradas
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFile(null);
                  setParsedData(null);
                }}
                className="rounded-lg"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Cancelar
              </Button>
            </div>

            {importing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className={theme.textMuted}>Importando...</span>
                  <span className={theme.text}>{progress.current}/{progress.total}</span>
                </div>
                <Progress value={(progress.current / progress.total) * 100} className="h-2" />
              </div>
            )}

            <ScrollArea className="h-48">
              <div className="space-y-1 pr-4">
                {parsedData.slice(0, 10).map((s, i) => (
                  <div key={i} className={`p-2 rounded-lg text-sm ${theme.bg}`}>
                    <span className={`font-medium ${theme.text}`}>{s.nome_serventia}</span>
                    <span className={`ml-2 ${theme.textMuted}`}>
                      {s.tribunal} - {s.municipio}/{s.uf}
                    </span>
                  </div>
                ))}
                {parsedData.length > 10 && (
                  <p className={`text-xs text-center pt-2 ${theme.textMuted}`}>
                    +{parsedData.length - 10} serventias...
                  </p>
                )}
              </div>
            </ScrollArea>

            <Button
              onClick={() => importMutation.mutate(parsedData)}
              disabled={importing}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700"
            >
              {importing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />Importar {parsedData.length} Serventias</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}