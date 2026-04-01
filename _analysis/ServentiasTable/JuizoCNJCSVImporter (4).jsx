import React, { useState } from 'react';
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, Loader2, CheckCircle, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function JuizoCNJCSVImporter({ darkMode = true }) {
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
            juizos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tribunal: { type: 'string' },
                  uf: { type: 'string' },
                  numero_serventia: { type: 'string' },
                  nome_serventia: { type: 'string' },
                  nome_juizo: { type: 'string' },
                  juizo_100_digital: { type: 'boolean' },
                  data_adesao: { type: 'string' },
                  tipo_unidade: { type: 'string' },
                  sistema_processual: { type: 'string' },
                  grau: { type: 'string' }
                }
              }
            }
          }
        }
      });

      return extractResult.output?.juizos || [];
    },
    onSuccess: (data) => {
      setParsedData(data);
      toast.success(`${data.length} juízos extraídos`);
    },
    onError: (err) => {
      toast.error('Erro ao analisar: ' + err.message);
    }
  });

  const importMutation = useMutation({
    mutationFn: async (juizos) => {
      setImporting(true);
      setProgress({ current: 0, total: juizos.length });

      const batchSize = 50;
      let imported = 0;
      let errors = 0;

      for (let i = 0; i < juizos.length; i += batchSize) {
        const batch = juizos.slice(i, i + batchSize);
        
        try {
          await base44.entities.JuizoCNJ.bulkCreate(batch);
          imported += batch.length;
        } catch (err) {
          errors += batch.length;
        }

        setProgress({ current: i + batch.length, total: juizos.length });
      }

      return { imported, errors, total: juizos.length };
    },
    onSuccess: (result) => {
      setImporting(false);
      queryClient.invalidateQueries(['juizos-cnj']);
      toast.success(`${result.imported} juízos importados${result.errors > 0 ? `, ${result.errors} erros` : ''}`);
      setFile(null);
      setParsedData(null);
    },
    onError: (err) => {
      setImporting(false);
      toast.error('Erro: ' + err.message);
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
      'tribunal,uf,numero_serventia,nome_serventia,juizo_100_digital,tipo_unidade,sistema_processual,grau',
      'TJSP,SP,0001,1ª Vara Cível Central,true,Vara,PJe,1º Grau',
      'TJRJ,RJ,0002,2ª Vara Criminal,false,Vara,PROJUDI,1º Grau'
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_juizos.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Template baixado');
  };

  return (
    <div className="space-y-4">
      <div className={`p-6 rounded-xl ${theme.cardBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-purple-500" />
            <h3 className={`font-semibold ${theme.text}`}>Importar Juízos CNJ</h3>
          </div>
          <Button size="sm" variant="outline" onClick={downloadTemplate} className="rounded-lg">
            <Download className="w-4 h-4 mr-1" />
            Template
          </Button>
        </div>

        {!parsedData ? (
          <div className="space-y-4">
            <div className={`border-2 border-dashed rounded-xl p-8 text-center ${theme.border}`}>
              <Upload className={`w-12 h-12 mx-auto mb-3 ${theme.textMuted}`} />
              <p className={`font-medium mb-2 ${theme.text}`}>Selecione CSV de Juízos</p>
              <p className={`text-sm mb-4 ${theme.textMuted}`}>
                Dados oficiais CNJ sobre unidades judiciárias
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="juizo-upload"
              />
              <label htmlFor="juizo-upload">
                <Button as="span" className="rounded-lg cursor-pointer" disabled={parseFileMutation.isPending}>
                  {parseFileMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Analisando...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-1" />Selecionar</>
                  )}
                </Button>
              </label>
            </div>

            <div className={`p-4 rounded-lg ${theme.bg} border ${theme.border}`}>
              <p className={`text-sm ${theme.textMuted}`}>
                <strong>Colunas:</strong> tribunal, uf, nome_serventia, juizo_100_digital, tipo_unidade
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-green-500">
                <CheckCircle className="w-3 h-3 mr-1" />
                {parsedData.length} juízos prontos
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFile(null);
                  setParsedData(null);
                }}
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
                <Progress value={(progress.current / progress.total) * 100} />
              </div>
            )}

            <ScrollArea className="h-48">
              <div className="space-y-1 pr-4">
                {parsedData.slice(0, 10).map((j, i) => (
                  <div key={i} className={`p-2 rounded-lg text-sm ${theme.bg}`}>
                    <span className={`font-medium ${theme.text}`}>{j.nome_serventia}</span>
                    <span className={`ml-2 ${theme.textMuted}`}>
                      {j.tribunal} - {j.uf}
                      {j.juizo_100_digital && <Badge className="ml-2 bg-blue-500/20 text-blue-400 text-xs">Digital</Badge>}
                    </span>
                  </div>
                ))}
                {parsedData.length > 10 && (
                  <p className={`text-xs text-center pt-2 ${theme.textMuted}`}>
                    +{parsedData.length - 10} juízos...
                  </p>
                )}
              </div>
            </ScrollArea>

            <Button
              onClick={() => importMutation.mutate(parsedData)}
              disabled={importing}
              className="w-full rounded-lg bg-purple-600 hover:bg-purple-700"
            >
              {importing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />Importar {parsedData.length} Juízos</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}