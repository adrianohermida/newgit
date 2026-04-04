import { useState } from "react";

/**
 * Componente DotobotExtensionManager
 * Permite ao usuário instalar, ativar e conceder permissões à extensão Universal LLM Assistant
 * Exibe status, instruções e consentimento de permissões
 */
export default function DotobotExtensionManager() {
  const [status, setStatus] = useState("not-installed"); // not-installed | installed | active | error
  const [error, setError] = useState("");

  // Simulação de instalação
  const handleInstall = () => {
    // Aqui, abriria o link da Chrome Web Store ou baixaria o ZIP
    window.open("https://github.com/adrianohermida/universal-llm-assistant/releases/latest", "_blank");
    setStatus("installed");
  };

  // Simulação de ativação
  const handleActivate = () => {
    // Aqui, tentaria detectar a extensão via window.postMessage ou chrome.runtime
    setStatus("active");
  };

  // Simulação de consentimento
  const handleConsent = () => {
    alert("Permissões concedidas! A extensão poderá acessar recursos locais e web conforme solicitado.");
  };

  return (
    <section className="rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.03)] p-6 mt-6">
      <h2 className="text-xl font-bold mb-2 text-[#C5A059]">Extensão Universal LLM Assistant</h2>
      <p className="mb-4 text-[#F4F1EA]">Permite que o Dotobot acesse arquivos locais, navegue na web e execute ações avançadas com sua permissão.</p>
      <div className="mb-4">
        <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold border border-[#C5A059] text-[#C5A059] bg-[rgba(197,160,89,0.08)]">
          Status: {status === "not-installed" ? "Não instalada" : status === "installed" ? "Instalada" : status === "active" ? "Ativa" : "Erro"}
        </span>
      </div>
      {status === "not-installed" && (
        <button
          className="rounded-2xl bg-[#D9B46A] px-6 py-3 text-sm font-bold text-[#1A1A1A] transition hover:bg-[#C5A059] mb-2"
          onClick={handleInstall}
        >
          Instalar extensão
        </button>
      )}
      {status === "installed" && (
        <button
          className="rounded-2xl bg-[#C5A059] px-6 py-3 text-sm font-bold text-[#1A1A1A] transition hover:bg-[#D9B46A] mb-2"
          onClick={handleActivate}
        >
          Ativar extensão
        </button>
      )}
      {status === "active" && (
        <button
          className="rounded-2xl bg-[#8FCFA9] px-6 py-3 text-sm font-bold text-[#1A1A1A] transition hover:bg-[#6BBF8A] mb-2"
          onClick={handleConsent}
        >
          Conceder permissões
        </button>
      )}
      {error && <p className="text-red-500 mt-2">{error}</p>}
      <ul className="mt-4 text-[#C5A059] text-xs list-disc pl-5">
        <li>Você controla quando ativar/desativar a extensão.</li>
        <li>Permissões só são solicitadas quando necessárias.</li>
        <li>Nenhum dado sensível é enviado sem seu consentimento.</li>
        <li>Você pode revogar o acesso a qualquer momento.</li>
      </ul>
    </section>
  );
}
