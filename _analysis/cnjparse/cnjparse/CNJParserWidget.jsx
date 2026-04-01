import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, CheckCircle, AlertCircle, Building2, MapPin, Phone, Mail, Database, TestTube2 } from 'lucide-react';
import CNJParser from '@/components/utils/CNJParser';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import EditableAPITest from './EditableAPITest';
import BuscaCNJAutocomplete from './BuscaCNJAutocomplete';

export default function CNJParserWidget() {
  const { data: escritorio } = useQuery({
    queryKey: ['escritorio'],
    queryFn: async () => {
      const result = await base44.entities.Escritorio.list();
      return result[0];
    }
  });
  const [cnj, setCnj] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showTest, setShowTest] = useState(false);

  const handleParse = async () => {
    if (!cnj) {
      toast.error('Digite um número CNJ');
      return;
    }

    setLoading(true);
    setShowTest(false);
    try {
      const enriched = await CNJParser.enrichCNJData(cnj, base44);
      setResult(enriched);
      
      if (!enriched.valido) {
        toast.error('CNJ inválido');
      } else if (enriched.enriquecido) {
        toast.success('CNJ analisado e enriquecido');
      } else {
        toast.info('CNJ analisado (sem dados extras)');
      }
    } catch (error) {
      toast.error('Erro ao analisar CNJ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parser CNJ + DataJud</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <BuscaCNJAutocomplete
            value={cnj}
            onChange={(value) => setCnj(value)}
            placeholder="Digite ou cole o número CNJ (com autocomplete)"
          />
          <Button onClick={handleParse} disabled={loading}>
            <Search className="w-4 h-4 mr-2" />
            {loading ? 'Analisando...' : 'Analisar'}
          </Button>
        </div>

        {result && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-start gap-3">
              {result.valido ? (
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-mono text-lg font-semibold">{result.formatado || result.limpo}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline">Ano: {result.ano}</Badge>
                  <Badge variant="outline">Tribunal: {result.tribunal_sigla || result.tribunal}</Badge>
                  {result.comarca && <Badge className="bg-blue-600">Comarca: {result.comarca}</Badge>}
                  {result.vara && <Badge className="bg-green-600">Vara: {result.vara}</Badge>}
                  {result.codigo_foro && (
                    <Badge className="bg-purple-600">Foro: {result.codigo_foro.codigo}</Badge>
                  )}
                  {result.enriquecido && (
                    <Badge className="bg-green-700">✓ Enriquecido via {result.fonte_enriquecimento}</Badge>
                  )}
                </div>
              </div>
            </div>

            {result.serventia && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <h3 className="font-semibold text-blue-900">Serventia CNJ</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <p><strong>Nome:</strong> {result.serventia.nome}</p>
                  <p><strong>Município:</strong> {result.serventia.municipio}/{result.serventia.uf}</p>
                  {result.serventia.tipo_orgao && (
                    <Badge variant="outline">{result.serventia.tipo_orgao}</Badge>
                  )}
                </div>
              </div>
            )}

            {result.juizo && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Scale className="w-4 h-4 text-green-600" />
                  <h3 className="font-semibold text-green-900">Juízo CNJ</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <p><strong>Nome:</strong> {result.juizo.nome}</p>
                  {result.juizo.digital_100 && (
                    <Badge className="bg-green-600">100% Digital</Badge>
                  )}
                  {result.juizo.tipo_unidade && (
                    <Badge variant="outline">{result.juizo.tipo_unidade}</Badge>
                  )}
                </div>
              </div>
            )}

            {result.datajud && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-600" />
                  <h3 className="font-semibold text-purple-900">Endpoint DataJud</h3>
                </div>
                
                <code className="text-xs bg-purple-900 text-purple-100 px-3 py-2 rounded block overflow-x-auto">
                  https://api-publica.datajud.cnj.jus.br/{result.datajud.alias}/_search
                </code>
                
                <div className="flex gap-2 text-xs flex-wrap">
                  <Badge variant="outline">Graus: {result.datajud.graus?.join(', ')}</Badge>
                  <Badge variant="outline">Justiça: {result.datajud.justice}</Badge>
                </div>

                <Button 
                  onClick={() => setShowTest(!showTest)}
                  size="sm"
                  variant="outline"
                  className="w-full"
                >
                  <TestTube2 className="w-4 h-4 mr-2" />
                  {showTest ? 'Ocultar' : 'Testar Endpoint (API Real)'}
                </Button>

                {showTest && (
                  <EditableAPITest 
                    cnj={cnj}
                    endpointAlias={result.datajud.alias}
                    escritorioId={escritorio?.id}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}