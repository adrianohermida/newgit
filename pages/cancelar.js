import { useEffect, useState } from "react";
import Head from "next/head";

export default function Cancelar() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("loading");
  const [mensagem, setMensagem] = useState("");
  const [agendamento, setAgendamento] = useState(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    const currentToken = new URLSearchParams(window.location.search).get("token") || "";
    setToken(currentToken);
    if (!currentToken) {
      setStatus("erro");
      setMensagem("Token de cancelamento ausente.");
      setLoading(false);
      return;
    }

    fetch(`/api/cancelar?token=${encodeURIComponent(currentToken)}&mode=json`, {
      headers: { Accept: "application/json" },
    })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok || !data?.ok) {
          setStatus(data?.status || "erro");
          setMensagem(data?.message || "Nao foi possivel carregar o cancelamento.");
        } else {
          setStatus(data.status || "pronto_para_cancelar");
          setMensagem(data.message || "Confirme o cancelamento do agendamento.");
          setAgendamento(data.agendamento || null);
        }
      })
      .catch(() => {
        setStatus("erro");
        setMensagem("Nao foi possivel carregar o cancelamento.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCancelar() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      setStatus(data?.status || (res.ok ? "cancelado" : "erro"));
      setMensagem(data?.message || (res.ok ? "Agendamento cancelado com sucesso." : "Erro ao cancelar agendamento."));
    } catch {
      setStatus("erro");
      setMensagem("Erro ao cancelar agendamento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Cancelamento de Agendamento | Hermida Maia</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-[#050706] text-[#F4F1EA] px-4">
        <div className="max-w-lg w-full rounded-xl border bg-black/80 p-8 shadow-lg text-center" style={{ borderColor: "#C5A059" }}>
          <h1 className="text-2xl font-bold mb-4" style={{ color: "#C5A059" }}>
            {loading ? "Carregando..." : status === "cancelado" || status === "ja_cancelado" ? "Agendamento Cancelado" : "Cancelar Agendamento"}
          </h1>
          <p className="text-lg opacity-80 mb-4">{mensagem}</p>
          {agendamento && status === "pronto_para_cancelar" && (
            <div className="text-left rounded-lg border border-[#2D2E2E] bg-black/40 p-4 mb-6">
              <p><strong>Área:</strong> {agendamento.area}</p>
              <p><strong>Data:</strong> {agendamento.dataFormatada}</p>
              <p><strong>Horário:</strong> {agendamento.hora}</p>
            </div>
          )}
          {status === "pronto_para_cancelar" && (
            <button
              onClick={handleCancelar}
              disabled={submitting}
              className="inline-block mt-4 px-6 py-3 rounded-lg font-semibold bg-[#7f1d1d] text-[#F4F1EA] hover:opacity-90 transition-all disabled:opacity-60"
            >
              {submitting ? "Cancelando..." : "Confirmar cancelamento"}
            </button>
          )}
          {status !== "pronto_para_cancelar" && (
            <a href="/" className="inline-block mt-4 px-6 py-3 rounded-lg font-semibold bg-[#C5A059] text-[#050706] hover:opacity-90 transition-all">
              Voltar ao início
            </a>
          )}
        </div>
      </div>
    </>
  );
}
