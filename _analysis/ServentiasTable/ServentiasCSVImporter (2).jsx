import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function ServentiasCSVImporter() {
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

      // Map CSV to Serventia schema
      const serventias = rows
        .map((row) => ({
          codigo: row.codigo || row.code || "",
          nome: row.nome || row.name || "",
          tribunal: row.tribunal || row.tribunal_sigla || "",
          municipio: row.municipio || row.cidade || "",
          cartorio_tipo: row.cartorio_tipo || row.type || "civel",
          endereco: row.endereco || row.address || "",
          telefone: row.telefone || row.phone || "",
          email: row.email || "",
          ativo: row.ativo?.toLowerCase() !== "false",
        }))
        .filter((s) => s.codigo && s.nome && s.tribunal);

      if (serventias.length === 0) {
        toast.error("Nenhuma serventia válida encontrada");
        setLoading(false);
        return;
      }

      // Bulk create em lotes
      const loteSize = 50;
      let totalCriados = 0;

      for (let i = 0; i < serventias.length; i += loteSize) {
        const lote = serventias.slice(i, i + loteSize);
        try {
          await base44.entities.Serventia.bulkCreate(lote);
          totalCriados += lote.length;
        } catch (err) {
          console.warn(`Erro no lote ${i / loteSize + 1}:`, err);
        }
      }

      setStats({ criados: totalCriados, total: serventias.length });
      toast.success(`${totalCriados} serventias importadas`);
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao processar CSV");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Importar Serventias (Cartórios)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-slate-600 bg-blue-50 p-3 rounded">
          <p className="font-medium mb-1">Formato esperado:</p>
          <p>codigo, nome, tribunal, municipio, cartorio_tipo, endereco, telefone, email, ativo</p>
        </div>

        <Input
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          disabled={loading}
          className="cursor-pointer"
        />

        {stats && (
          <div className="bg-green-50 p-3 rounded space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>✅ {stats.criados} serventias importadas</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}