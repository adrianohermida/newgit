import { useEffect, useState } from "react";
import Head from "next/head";

export default function Confirmar() {
  const [status, setStatus] = useState("loading");
  const [mensagem, setMensagem] = useState("");
  const [confirmedLabel, setConfirmedLabel] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    if (!token) {
      setStatus("erro");
      setMensagem("Token de confirmação ausente.");
      return;
    }
    fetch(`/api/confirmar?token=${encodeURIComponent(token)}&mode=json`, {
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!data) {
          setStatus("erro");
          setMensagem("Nao foi possivel validar este link agora.");
          return;
        }

        if (res.ok) {
          setStatus(data.status || "ok");
          setMensagem(data.message || "Sua consulta foi confirmada com sucesso.");
          setConfirmedLabel(data.confirmedLabel || "");
        } else {
          setStatus(data.status || "erro");
          setMensagem(data.message || "Erro ao processar confirmação.");
        }
      })
      .catch(() => {
        setStatus("erro");
        setMensagem("Erro ao processar confirmação.");
      });
  }, []);

  const titulo =
    status === "loading"
      ? "Confirmando..."
      : status === "confirmado"
        ? "Agendamento Confirmado"
        : status === "ja_confirmado"
          ? "Agendamento Já Confirmado"
          : status === "expirado"
            ? "Link Expirado"
            : "Erro na Confirmação";

  return (
    <>
      <Head>
        <title>Confirmação de Agendamento | Hermida Maia</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-[#050706] text-[#F4F1EA] px-4">
        <div className="max-w-lg w-full rounded-xl border bg-black/80 p-8 shadow-lg text-center" style={{ borderColor: '#C5A059' }}>
          <h1 className="text-2xl font-bold mb-4" style={{ color: '#C5A059' }}>
            {titulo}
          </h1>
          <p className="text-lg opacity-80 mb-4">{mensagem}</p>
          {status === "ja_confirmado" && confirmedLabel && (
            <p className="text-sm opacity-60 mb-4">Confirmado em {confirmedLabel}</p>
          )}
          {(status === "confirmado" || status === "ja_confirmado") && (
            <a href="/" className="inline-block mt-4 px-6 py-3 rounded-lg font-semibold bg-[#C5A059] text-[#050706] hover:opacity-90 transition-all">Voltar ao início</a>
          )}
          {status === "expirado" && (
            <a href="/agendamento" className="inline-block mt-4 px-6 py-3 rounded-lg font-semibold bg-[#C5A059] text-[#050706] hover:opacity-90 transition-all">Agendar novamente</a>
          )}
          {(status === "erro" || status === "loading") && (
            <a href="/" className="inline-block mt-4 px-6 py-3 rounded-lg font-semibold border border-[#C5A059] text-[#C5A059] hover:bg-[#C5A059] hover:text-[#050706] transition-all">Voltar ao site</a>
          )}
        </div>
      </div>
    </>
  );
}
