import { useEffect, useState } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { buildSupabaseLocalBootstrap } from "../../../lib/lawdesk/supabase-local-bootstrap.js";

export default function useAiTaskRagHealth({ localStackSummary, pushLog }) {
  const [ragHealth, setRagHealth] = useState(null);

  useEffect(() => {
    let active = true;
    adminFetch("/api/admin-dotobot-rag-health?include_upsert=0", { method: "GET" })
      .then((payload) => {
        if (active) setRagHealth(payload || null);
      })
      .catch((fetchError) => {
        if (active) {
          setRagHealth({
            status: "failed",
            error: fetchError?.message || "Falha no healthcheck RAG.",
            signals: {},
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCopySupabaseLocalEnvBlock() {
    const envBlock = buildSupabaseLocalBootstrap({ localStackSummary, ragHealth }).envBlock;
    if (!envBlock) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(envBlock);
      }
      pushLog({
        type: "control",
        action: "Env local copiado",
        result: "Bloco de variaveis do Supabase local copiado para a area de transferencia.",
      });
    } catch {}
  }

  return {
    handleCopySupabaseLocalEnvBlock,
    ragHealth,
  };
}
