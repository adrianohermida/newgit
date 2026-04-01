import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Upload, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function CodigoForoTJSPImporter() {
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

      // Map to CodigoForoTJSP schema
      const codigos = rows
        .map((row) => ({
          codigo_tjsp: row.codigo_tjsp || row.tjsp_code || "",
          codigo_cnj: parseInt(row.codigo_cnj || row.cnj_code) || 0,
          nome_foro: row.nome_foro || row.nome || row.name || "",
          municipio: row.municipio || row.cidade || "",
          comarca: row.comarca || row.comarca_name || "",
          grau: row.grau || "G1",
          ativo: row.ativo?.toLowerCase() !== "false",
        }))
        .filter((c) => c.codigo_tjsp && c.codigo_cnj && c.nome_foro);

      if (codigos.length === 0) {
        toast.error("Nenhum código válido encontrado");
        setLoading(false);
        return;
      }

      // Bulk create
      const loteSize = 50;
      let totalCriados = 0;

      for (let i = 0; i < codigos.length; i += loteSize) {
        const lote = codigos.slice(i, i + loteSize);
        try {
          await base44.entities.CodigoForoTJSP.bulkCreate(lote);
          totalCriados += lote.length;
        } catch (err) {
          console.warn(`Erro no lote:`, err);
        }
      }

      setStats({ criados: totalCriados, total: codigos.length });
      toast.success(`${totalCriados} códigos TJSP importados`);
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
          Importar Códigos Foro TJSP
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-slate-600 bg-blue-50 p-3 rounded">
          <p className="font-medium mb-1">Formato esperado:</p>
          <p>codigo_tjsp, codigo_cnj, nome_foro, municipio, comarca, grau, ativo</p>
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
              <span>✅ {stats.criados} códigos TJSP importados</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}