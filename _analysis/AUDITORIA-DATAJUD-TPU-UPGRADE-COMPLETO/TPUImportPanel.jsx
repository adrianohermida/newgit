import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Database, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function TPUImportPanel() {
  const [activeTab, setActiveTab] = useState('classe');
  const [classesJSON, setClassesJSON] = useState('');
  const [movimentosJSON, setMovimentosJSON] = useState('');
  const [assuntosJSON, setAssuntosJSON] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async (tabela, jsonData) => {
    if (!jsonData.trim()) {
      toast.error('Cole o JSON da tabela TPU');
      return;
    }

    setImporting(true);
    setResult(null);

    try {
      const registros = JSON.parse(jsonData);

      if (!Array.isArray(registros)) {
        throw new Error('JSON deve ser um array de objetos');
      }

      const { data } = await base44.functions.invoke('syncTPUTabelas', {
        tabela,
        registros
      });

      setResult(data);
      
      if (data.success) {
        toast.success(`${data.imported} registros importados com sucesso!`);
      } else {
        toast.error(data.error || 'Erro ao importar');
      }
    } catch (error) {
      toast.error(error.message);
      setResult({ success: false, error: error.message });
    } finally {
      setImporting(false);
    }
  };

  const exampleClasse = `[
  {
    "codigo": "1116",
    "nome": "Execução Fiscal",
    "descricao": "Cobrança de dívida ativa da Fazenda Pública",
    "tipo": "execucao",
    "segmento": "todos",
    "ativo": true
  },
  {
    "codigo": "285",
    "nome": "Procedimento Comum Cível",
    "descricao": "Ação de conhecimento ordinária",
    "tipo": "conhecimento",
    "segmento": "justica_estadual",
    "ativo": true
  }
]`;

  const exampleMovimento = `[
  {
    "codigo": "123",
    "nome": "Sentença",
    "descricao": "Prolação de sentença pelo juiz",
    "categoria": "decisao",
    "gera_prazo": true,
    "segmento": "todos",
    "ativo": true
  },
  {
    "codigo": "246",
    "nome": "Juntada de Documento",
    "descricao": "Inclusão de documento nos autos",
    "categoria": "processamento",
    "gera_prazo": false,
    "segmento": "todos",
    "ativo": true
  }
]`;

  const exampleAssunto = `[
  {
    "codigo": "7980",
    "nome": "Direito Tributário",
    "descricao": "Assunto relacionado a tributos",
    "segmento": "todos",
    "codigo_pai": null,
    "ativo": true
  },
  {
    "codigo": "7982",
    "nome": "IPTU",
    "descricao": "Imposto Predial e Territorial Urbano",
    "segmento": "todos",
    "codigo_pai": "7980",
    "ativo": true
  }
]`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[#00a2ff]" />
            Importação de Tabelas TPU (CNJ)
          </CardTitle>
          <p className="text-sm text-slate-600">
            Importe Tabelas Processuais Unificadas do CNJ (Classes, Movimentos, Assuntos)
          </p>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="classe">Classes</TabsTrigger>
          <TabsTrigger value="movimento">Movimentos</TabsTrigger>
          <TabsTrigger value="assunto">Assuntos</TabsTrigger>
        </TabsList>

        {/* TAB: CLASSES */}
        <TabsContent value="classe" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Importar Classes Processuais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={exampleClasse}
                value={classesJSON}
                onChange={(e) => setClassesJSON(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <Button
                onClick={() => handleImport('classe', classesJSON)}
                disabled={importing}
                className="bg-[#00a2ff] hover:bg-[#0088cc] w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                {importing ? 'Importando...' : 'Importar Classes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: MOVIMENTOS */}
        <TabsContent value="movimento" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Importar Movimentos Processuais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={exampleMovimento}
                value={movimentosJSON}
                onChange={(e) => setMovimentosJSON(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <Button
                onClick={() => handleImport('movimento', movimentosJSON)}
                disabled={importing}
                className="bg-[#00a2ff] hover:bg-[#0088cc] w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                {importing ? 'Importando...' : 'Importar Movimentos'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: ASSUNTOS */}
        <TabsContent value="assunto" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Importar Assuntos Processuais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={exampleAssunto}
                value={assuntosJSON}
                onChange={(e) => setAssuntosJSON(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <Button
                onClick={() => handleImport('assunto', assuntosJSON)}
                disabled={importing}
                className="bg-[#00a2ff] hover:bg-[#0088cc] w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                {importing ? 'Importando...' : 'Importar Assuntos'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Result Display */}
      {result && (
        <Card className={result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              Resultado da Importação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">Total:</span>
              <Badge variant="outline">{result.total}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Importados:</span>
              <Badge className="bg-green-100 text-green-800">{result.imported}</Badge>
            </div>
            {result.errors > 0 && (
              <div className="flex justify-between">
                <span className="font-medium">Erros:</span>
                <Badge className="bg-red-100 text-red-800">{result.errors}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}