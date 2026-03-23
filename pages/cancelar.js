import Head from "next/head";

export default function Cancelar() {
  const token =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("token")
      : null;

  return (
    <>
      <Head>
        <title>Cancelamento de Agendamento | Hermida Maia</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-[#050706] text-[#F4F1EA] px-4">
        <div className="max-w-lg w-full rounded-xl border bg-black/80 p-8 shadow-lg text-center" style={{ borderColor: "#C5A059" }}>
          <h1 className="text-2xl font-bold mb-4" style={{ color: "#C5A059" }}>
            Cancelamento de Agendamento
          </h1>
          <p className="text-lg opacity-80 mb-4">
            {token
              ? "Recebemos seu link seguro de cancelamento. Este fluxo dedicado será habilitado na próxima etapa."
              : "Token de cancelamento ausente ou inválido."}
          </p>
          <a href="/" className="inline-block mt-4 px-6 py-3 rounded-lg font-semibold bg-[#C5A059] text-[#050706] hover:opacity-90 transition-all">
            Voltar ao início
          </a>
        </div>
      </div>
    </>
  );
}
