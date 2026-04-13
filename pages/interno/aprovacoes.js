import { useRouter } from "next/router";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import AprovacoesModule from "../../components/interno/AprovacoesModule";

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

export default function InternoAprovacoesPage() {
  const router = useRouter();
  const focus = {
    requestId: typeof router.query.requestId === "string" ? router.query.requestId : "",
    clientId: typeof router.query.clientId === "string" ? router.query.clientId : "",
    documentId: typeof router.query.documentId === "string" ? router.query.documentId : "",
  };
  const copilotContext = parseCopilotContext(typeof router.query.copilotContext === "string" ? router.query.copilotContext : "");
  const hasFocus = Boolean(focus.requestId || focus.clientId || focus.documentId);
  const initialDepartment = focus.documentId ? "documentacoes" : "cadastro";

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Aprovacoes"
          description="Central de pedidos pendentes do portal do cliente. Aqui o escritorio valida alteracoes cadastrais hoje e passa a absorver, no mesmo fluxo, demandas futuras de financeiro e documentacoes."
        >
          <div className="space-y-6">
            {copilotContext ? (
              <section className="border border-[#35554B] bg-[rgba(12,22,19,0.72)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#7FC4AF]">Contexto vindo do Copilot</p>
                <p className="mt-3 text-sm font-semibold text-[#F5F1E8]">{copilotContext.conversationTitle || "Conversa ativa"}</p>
                {copilotContext.mission ? <p className="mt-3 text-sm opacity-70">{copilotContext.mission}</p> : null}
              </section>
            ) : null}
            {hasFocus ? (
              <section className="border border-[#6F5826] bg-[rgba(111,88,38,0.12)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C5A059]">Contexto vindo de Jobs</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm opacity-80">
                  {focus.requestId ? <span>Solicitacao: {focus.requestId}</span> : null}
                  {focus.clientId ? <span>Cliente: {focus.clientId}</span> : null}
                  {focus.documentId ? <span>Documento: {focus.documentId}</span> : null}
                </div>
                <p className="mt-3 text-sm opacity-70">Use este contexto para localizar a demanda do portal, validar o cadastro ou encaminhar a documentacao no mesmo fluxo de triagem.</p>
              </section>
            ) : null}
            <AprovacoesModule initialDepartment={initialDepartment} focusContext={focus} />
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
