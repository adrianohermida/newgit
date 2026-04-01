import React from 'react';
import { Scale } from 'lucide-react';
import TPUAnalyticsDashboard from '@/components/datajud/TPUAnalyticsDashboard';
import TPUStructureExplorer from '@/components/datajud/TPUStructureExplorer';
import TPUAutomationBuilder from '@/components/datajud/TPUAutomationBuilder';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * TPUAnalytics - Página dedicada a análises, exploração e automações TPU
 * Apresenta distribuição de classes, assuntos, movimentos, tendências e workflows
 */
export default function TPUAnalytics() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Scale className="w-8 h-8 text-[#212373]" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Analytics & Automações TPU</h1>
            <p className="text-slate-600 mt-1">Visualize distribuição de dados, estrutura hierárquica e crie workflows inteligentes</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="analytics" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-white shadow">
            <TabsTrigger value="analytics" className="gap-2">
              📊 Analytics
            </TabsTrigger>
            <TabsTrigger value="structure" className="gap-2">
              🏗️ Estrutura
            </TabsTrigger>
            <TabsTrigger value="automacoes" className="gap-2">
              ⚡ Automações
            </TabsTrigger>
          </TabsList>

          {/* Analytics Dashboard */}
          <TabsContent value="analytics" className="bg-white rounded-lg shadow p-6">
            <TPUAnalyticsDashboard />
          </TabsContent>

          {/* Estrutura Explorer */}
          <TabsContent value="structure" className="bg-white rounded-lg shadow p-6">
            <TPUStructureExplorer />
          </TabsContent>

          {/* Automations Builder */}
          <TabsContent value="automacoes" className="bg-white rounded-lg shadow p-6">
            <TPUAutomationBuilder />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}