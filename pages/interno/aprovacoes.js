import { useRouter } from "next/router";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import AprovacoesModule from "../../components/interno/AprovacoesModule";
import { useInternalTheme } from "../../components/interno/InternalThemeProvider";

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
  const { isLightTheme } = useInternalTheme();
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
      description="Central de aprovacoes com contexto claro para decidir rapido e manter a experiencia do cliente fluida."
        >
          <div className="space-y-6">
            {copilotContext ? (
              <section className={`border p-5 ${isLightTheme ? "border-[#bdd8cf] bg-[#f3fbf8] text-[#25403a]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)]"}`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#2c7a66]" : "text-[#7FC4AF]"}`}>Contexto da conversa</p>
                <p className={`mt-3 text-sm font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{copilotContext.conversationTitle || "Conversa ativa"}</p>
                {copilotContext.mission ? <p className={`mt-3 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{copilotContext.mission}</p> : null}
              </section>
            ) : null}
            {hasFocus ? (
              <section className="border border-[#6F5826] bg-[rgba(111,88,38,0.12)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C5A059]">Contexto trazido por automacoes</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm opacity-80">
                  {focus.requestId ? <span>Solicitacao: {focus.requestId}</span> : null}
                  {focus.clientId ? <span>Cliente: {focus.clientId}</span> : null}
                  {focus.documentId ? <span>Documento: {focus.documentId}</span> : null}
                </div>
                <p className="mt-3 text-sm opacity-70">Use este contexto para localizar a solicitacao, validar o cadastro ou encaminhar a documentacao com mais agilidade.</p>
              </section>
            ) : null}
            <AprovacoesModule initialDepartment={initialDepartment} focusContext={focus} />
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
