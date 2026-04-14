import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export default function KPICard({ titulo, valor, subtitulo, tendencia, icone: Icone, cor = 'blue' }) {
  const cores = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200'
  };

  const getTendenciaIcon = () => {
    if (tendencia > 0) return <ArrowUpRight className="w-4 h-4" />;
    if (tendencia < 0) return <ArrowDownRight className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  return (
    <Card className={`border ${cores[cor]}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600 mb-1">{titulo}</p>
            <p className="text-3xl font-bold text-gray-900">{valor}</p>
            {subtitulo && (
              <p className="text-xs text-gray-500 mt-2">{subtitulo}</p>
            )}
          </div>
          {Icone && (
            <div className={`p-3 rounded-lg ${cores[cor]} bg-opacity-20`}>
              <Icone className="w-6 h-6" />
            </div>
          )}
        </div>
        {tendencia !== undefined && (
          <div className="flex items-center gap-1 mt-4 text-sm font-medium">
            {getTendenciaIcon()}
            <span>{Math.abs(tendencia)}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}