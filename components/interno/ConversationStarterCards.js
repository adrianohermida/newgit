const STARTER_PROMPTS = [
  {
    label: "Resumo executivo",
    prompt: "Resuma o contexto atual, destaque riscos e proponha os proximos passos prioritarios.",
  },
  {
    label: "Transformar em AI Task",
    prompt: "Transforme esta demanda em um plano de execucao com subtarefas, dependencias e validacoes.",
  },
  {
    label: "Revisar com foco juridico",
    prompt: "Revise este contexto com foco juridico e operacional, apontando pendencias, riscos e a proxima acao recomendada.",
  },
];

function StarterCard({ card, isLightTheme, onSelectPrompt }) {
  return (
    <button
      type="button"
      onClick={() => onSelectPrompt(card.prompt)}
      className={`rounded-[24px] border p-4 text-left transition-all duration-200 active:scale-[0.99] ${
        isLightTheme
          ? "border-[#D7DEE8] bg-white hover:-translate-y-[1px] hover:border-[#C5A059] hover:shadow-[0_18px_30px_rgba(148,163,184,0.12)]"
          : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:-translate-y-[1px] hover:border-[#C5A059] hover:shadow-[0_18px_30px_rgba(0,0,0,0.22)]"
      }`}
    >
      <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#9A6E2D]" : "text-[#C5A059]"}`}>Atalho</p>
      <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{card.label}</p>
      <p className={`mt-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{card.prompt}</p>
    </button>
  );
}

export default function ConversationStarterCards({ isLightTheme, onSelectPrompt }) {
  if (typeof onSelectPrompt !== "function") return null;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {STARTER_PROMPTS.map((card) => (
        <StarterCard key={card.label} card={card} isLightTheme={isLightTheme} onSelectPrompt={onSelectPrompt} />
      ))}
    </div>
  );
}
