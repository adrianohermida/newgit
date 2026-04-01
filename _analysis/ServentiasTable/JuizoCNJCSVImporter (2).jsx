import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function JuizoCNJCSVImporter() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error("CSV deve ter header + dados");
        setLoading(false);
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const values = line.split(",");
        return headers.reduce((obj, h, i) => {
          obj[h] = values[i]?.trim() || "";
          return obj;
        }, {});
      });

      // Map CSV columns to JuizoCNJ schema
      const juizos = rows
        .map((row) => ({
          codigo: parseInt(row.codigo || row.code) || 0,
          nome: row.nome || row.name || "",
          tribunal: row.tribunal || row.tribunal_sigla || "",
          municipio: row.municipio || row.cidade || "",
          codigo_municipio_ibge: parseInt(row.codigo_municipio_ibge || row.ibge_code) || null,
          grau: row.grau || row.grau_juridical || "G1",
          segmento: row.segmento || row.segment || "estadual",
          ativo: row.ativo?.toLowerCase() !== "false",
          origem: "CNJ_DATAJUD",
        }))
        .filter((j) => j.codigo && j.nome && j.tribunal);

      if (juizos.length === 0) {
        toast.error("Nenhum juízo válido encontrado no CSV");
        setLoading(false);
        return;
      }

      // Bulk create em lotes
      const loteSize = 50;
      let totalCriados = 0;
      let totalErros = 0;

      for (let i = 0; i < juizos.length; i += loteSize) {
        const lote = juizos.slice(i, i + loteSize);
        try {
          await base44.entities.JuizoCNJ.bulkCreate(lote);
          totalCriados += lote.length;
        } catch (err) {
          console.warn(`Erro ao importar lote ${i / loteSize + 1}:`, err);
          totalErros += lote.length;
        }
      }

      setStats({
        criados: totalCriados,
        erros: totalErros,
        total: juizos.length,
      });

      toast.success(`${totalCriados} juízos importados com sucesso`);
    } catch (error) {
      console.error("Erro ao processar CSV:", error);
      toast.error("Erro ao processar arquivo CSV");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Importar Juízos (CNJ)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-slate-600 bg-blue-50 p-3 rounded">
          <p className="font-medium mb-1">Formato esperado:</p>
          <p>codigo, nome, tribunal, municipio, grau, segmento, ativo</p>
          <p className="text-xs mt-2">Ex: 1, Juízo 1ª Instância, TJSP, São Paulo, G1, estadual, true</p>
        </div>

        <div>
          <Input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            disabled={loading}
            className="cursor-pointer"
          />
        </div>

        {stats && (
          <div className="bg-green-50 p-3 rounded space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="font-medium">Importação concluída</span>
            </div>
            <p>
              <strong>{stats.criados}</strong> juízos criados
            </p>
            {stats.erros > 0 && (
              <p className="text-orange-600">
                <strong>{stats.erros}</strong> erros
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}