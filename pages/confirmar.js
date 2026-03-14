import { useEffect, useState } from "react";
import Head from "next/head";

export default function Confirmar() {
  const [status, setStatus] = useState("loading");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    if (!token) {
      setStatus("erro");
      setMensagem("Token de confirmação ausente.");
      return;
    }
    fetch(`/api/confirmar?token=${token}`)
      .then(async (res) => {
        const text = await res.text();
        if (res.ok) {
          setStatus("ok");
          setMensagem(text);
        } else {
          setStatus("erro");
          setMensagem(text);
        }
      })
      .catch(() => {
        setStatus("erro");
        setMensagem("Erro ao processar confirmação.");
      });
  }, []);

  return (
    <>
      <Head>
        <title>Confirmação de Agendamento | Hermida Maia</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-[#050706] text-[#F4F1EA] px-4">
        <div className="max-w-lg w-full rounded-xl border bg-black/80 p-8 shadow-lg text-center" style={{ borderColor: '#C5A059' }}>
          <h1 className="text-2xl font-bold mb-4" style={{ color: '#C5A059' }}>
            {status === "loading" ? "Confirmando..." : status === "ok" ? "Agendamento Confirmado!" : "Erro na Confirmação"}
          </h1>
          <p className="text-lg opacity-80 mb-4">{mensagem}</p>
          {status === "ok" && (
            <a href="/" className="inline-block mt-4 px-6 py-3 rounded-lg font-semibold bg-[#C5A059] text-[#050706] hover:opacity-90 transition-all">Voltar ao início</a>
          )}
        </div>
      </div>
    </>
  );
}
