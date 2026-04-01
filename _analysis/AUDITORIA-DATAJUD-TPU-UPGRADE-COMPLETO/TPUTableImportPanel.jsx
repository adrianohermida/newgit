import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Upload, Sheet, FileSpreadsheet, Table, Loader2, CheckCircle2, GitBranch, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function TPUTableImportPanel() {
  const [loading, setLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState('classes');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');

  const tableConfig = {
    classes: {
      entity: 'TPUClasse',
      icon: Table,
      color: 'text-blue-600',
      label: 'Classes Processuais',
      fields: ['codigo', 'nome', 'glossario']
    },
    movimentos: {
      entity: 'TPUMovimento',
      icon: GitBranch,
      color: 'text-green-600',
      label: 'Movimentos',
      fields: ['codigo', 'nome', 'tipo_responsavel']
    },
    assuntos: {
      entity: 'TPUAssunto',
      icon: FileText,
      color: 'text-purple-600',
      label: 'Assuntos',
      fields: ['codigo', 'nome', 'pai']
    }
  };

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Apenas arquivos CSV');
      return;
    }

    setLoading(true);
    try {
      // Upload
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Parse CSV
      const response = await fetch(file_url);
      const text = await response.text();
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      
      // Validar headers
      const config = tableConfig[selectedTable];
      const requiredFields = config.fields;
      const missingFields = requiredFields.filter(f => !headers.includes(f));
      
      if (missingFields.length > 0) {
        toast.error(`Campos obrigatórios faltando: ${missingFields.join(', ')}`);
        return;
      }

      // Processar linhas
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx];
        });
        row.fonte = 'csv_upload';
        row.data_coleta = new Date().toISOString();
        data.push(row);
      }

      // Bulk insert
      await base44.entities[config.entity].bulkCreate(data);
      
      toast.success(`${data.length} registros importados para ${config.label}!`);
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSheetImport = async () => {
    if (!googleSheetUrl.trim()) {
      toast.error('Informe a URL da Google Sheet');
      return;
    }

    setLoading(true);
    try {
      // Extrair sheet ID
      const sheetIdMatch = googleSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetIdMatch) {
        toast.error('URL inválida');
        return;
      }

      const sheetId = sheetIdMatch[1];
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

      // Fetch CSV
      const response = await fetch(csvUrl);
      if (!response.ok) {
        toast.error('Erro ao acessar planilha. Verifique se está pública.');
        return;
      }

      const text = await response.text();
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      
      // Processar
      const config = tableConfig[selectedTable];
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx];
        });
        row.fonte = 'google_sheets';
        row.data_coleta = new Date().toISOString();
        data.push(row);
      }

      await base44.entities[config.entity].bulkCreate(data);
      
      toast.success(`${data.length} registros importados do Google Sheets!`);
      setGoogleSheetUrl('');
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar Tabelas TPU</CardTitle>
          <p className="text-xs text-slate-600 mt-1">
            Classes, Movimentos e Assuntos do CNJ
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Seletor de Tabela */}
          <div>
            <label className="text-sm font-medium mb-2 block">Tabela Destino</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(tableConfig).map(([key, config]) => {
                const Icon = config.icon;
                const selected = selectedTable === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedTable(key)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      selected
                        ? 'border-[#00a2ff] bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mx-auto mb-1 ${selected ? 'text-[#00a2ff]' : config.color}`} />
                    <p className="text-xs font-medium">{config.label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Tabs defaultValue="csv" className="space-y-3">
            <TabsList className="w-full">
              <TabsTrigger value="csv" className="flex-1 gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                CSV Upload
              </TabsTrigger>
              <TabsTrigger value="sheets" className="flex-1 gap-2">
                <Sheet className="w-4 h-4" />
                Google Sheets
              </TabsTrigger>
            </TabsList>

            <TabsContent value="csv">
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="hidden"
                  id={`csv-upload-${selectedTable}`}
                  disabled={loading}
                />
                <label
                  htmlFor={`csv-upload-${selectedTable}`}
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-8 h-8 text-[#00a2ff] animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8 text-[#00a2ff]" />
                  )}
                  <div>
                    <p className="font-medium">
                      {loading ? 'Importando...' : 'Selecionar CSV'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Campos: {tableConfig[selectedTable].fields.join(', ')}
                    </p>
                  </div>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="sheets" className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-2 block">URL da Planilha</label>
                <Input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={googleSheetUrl}
                  onChange={(e) => setGoogleSheetUrl(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1">
                  ⚠️ A planilha precisa estar pública (qualquer pessoa com o link pode visualizar)
                </p>
              </div>

              <Button
                onClick={handleGoogleSheetImport}
                disabled={loading || !googleSheetUrl.trim()}
                className="w-full bg-[#00a2ff] hover:bg-[#0088cc]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Sheet className="w-4 h-4 mr-2" />
                    Importar do Google Sheets
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>

          {/* Template Info */}
          <div className="p-3 bg-slate-50 rounded-lg text-xs">
            <p className="font-semibold mb-1">📋 Formato CSV Esperado:</p>
            <code className="block bg-white p-2 rounded mt-1 text-xs">
              {tableConfig[selectedTable].fields.join(',')}
              <br />
              {selectedTable === 'classes' && '1116,Execução Fiscal,"Ação de cobrança judicial..."'}
              {selectedTable === 'movimentos' && '123,Conclusão para Sentença,Magistrado'}
              {selectedTable === 'assuntos' && '9881,Indenização por Dano Material,9880'}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}