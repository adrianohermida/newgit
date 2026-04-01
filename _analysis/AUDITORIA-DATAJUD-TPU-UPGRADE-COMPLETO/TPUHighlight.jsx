import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gavel, BookOpen, FileText, Database, TrendingUp } from 'lucide-react';

/**
 * Componente destaque que mostra o valor e status das implementações TPU
 */
export default function TPUHighlight() {
  const tpuFeatures = [
    {
      icon: Gavel,
      label: 'Classes TPU',
      description: 'Estrutura processual padronizada',
      color: 'blue',
      status: '✅ Ativa'
    },
    {
      icon: BookOpen,
      label: 'Assuntos TPU',
      description: 'Classificação de matérias jurídicas',
      color: 'purple',
      status: '✅ Ativa'
    },
    {
      icon: FileText,
      label: 'Movimentos TPU',
      description: 'Catálogo de atos processuais',
      color: 'green',
      status: '✅ Ativa'
    },
    {
      icon: Database,
      label: 'Documentos TPU',
      description: 'Tipos de documentos processuais',
      color: 'amber',
      status: '✅ Ativa'
    }
  ];

  return (
    <div className="space-y-4">
      {/* Header com destaque */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <TrendingUp className="w-8 h-8 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 mb-1">Implementação TPU</h2>
              <p className="text-sm text-slate-700 mb-3">
                Integração completa com o Tribunal de Contas da União para estruturação de dados processuais
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-green-500 text-white">CNJ Compliant</Badge>
                <Badge className="bg-blue-500 text-white">100% Operacional</Badge>
                <Badge className="bg-amber-500 text-white">DataJud Integrado</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid de funcionalidades TPU */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tpuFeatures.map((feature, idx) => {
          const Icon = feature.icon;
          const bgColor = {
            blue: 'bg-blue-50 border-blue-200',
            purple: 'bg-purple-50 border-purple-200',
            green: 'bg-green-50 border-green-200',
            amber: 'bg-amber-50 border-amber-200'
          }[feature.color];

          const iconColor = {
            blue: 'text-blue-600',
            purple: 'text-purple-600',
            green: 'text-green-600',
            amber: 'text-amber-600'
          }[feature.color];

          return (
            <Card key={idx} className={`${bgColor} border`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <Icon className={`w-6 h-6 ${iconColor}`} />
                  <span className="text-xs font-semibold text-green-600">{feature.status}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{feature.label}</h3>
                  <p className="text-xs text-slate-600 mt-1">{feature.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Benefícios */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-sm">Benefícios da Implementação TPU</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <span><strong>Dados Estruturados:</strong> Códigos e estrutura padronizada do CNJ</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <span><strong>Busca Inteligente:</strong> Filtros precisos por classe, assunto, movimento</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <span><strong>Enriquecimento Automático:</strong> Sincronização com DataJud atualiza TPU</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <span><strong>Analytics:</strong> Relatórios por tipo de classe, assunto, movimento</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <span><strong>Conformidade Legal:</strong> Estrutura compliant com resolução CNJ</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}