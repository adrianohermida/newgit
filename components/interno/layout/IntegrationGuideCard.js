import { useInternalTheme } from "../InternalThemeProvider";

const MODULE_INTEGRATION_GUIDES = {
  "/interno/contacts": { title: "Contatos: webhooks e edge functions", subtitle: "Freshsales, Supabase, portal e interno alinhados no mesmo fluxo.", items: [{ label: "Painel interno", helper: "Operacoes do frontend passam por /api/admin-hmadv-contacts para sync, enriquecimento, reconciliacao e bulk actions.", endpoint: "/api/admin-hmadv-contacts", trigger: "Use para sync_contacts, enrich_cep, enrich_directdata, merge_contacts e vinculacao em lote." }, { label: "Webhook Freshsales", helper: "O webhook central do CRM deve cair em fs-webhook para responder rapido e enfileirar o processamento.", endpoint: "_hmadv_review/supabase/functions/fs-webhook", trigger: "Configure o workflow do Freshsales para POST com account_id e cf_processo sempre que o account/contato precisar disparar sincronizacao operacional." }, { label: "Processo e espelho", helper: "Quando a reconciliacao do contato depende do processo, a trilha de processo-sync, datajud-worker e sync-worker fecha o ciclo HMADV -> Freshsales.", endpoint: "_hmadv_review/supabase/functions/processo-sync + datajud-worker + sync-worker", trigger: "Acione quando o contato depende de processo, activity ou account repair antes de consolidar os dados do CRM." }, { label: "Persistencia portal", helper: "Dados exibidos ao cliente ficam persistidos no portal via perfil, sem perder o espelho operacional do interno.", endpoint: "/api/client-profile", trigger: "Use para manter contacts/addresses consistentes em /portal/perfil depois da higienizacao da base." }] },
  "/interno/processos": { title: "Processos: acionamento operacional", subtitle: "DataJud, Freshsales e HMADV sincronizados a partir do interno.", items: [{ label: "Painel interno", helper: "As acoes do modulo usam /api/admin-hmadv-processos como ponte segura do frontend.", endpoint: "/api/admin-hmadv-processos", trigger: "Use para lotes, correcao operacional, auditoria e reparo orientado por fila." }, { label: "Webhook / Edge", helper: "fs-webhook recebe o evento rapido; processo-sync e datajud-worker consolidam o processo no Supabase.", endpoint: "_hmadv_review/supabase/functions/fs-webhook + processo-sync + datajud-worker", trigger: "Acione quando o Freshsales ou DataJud precisar iniciar/validar a sincronizacao do processo." }] },
  "/interno/publicacoes": { title: "Publicacoes: fila e reflexo CRM", subtitle: "Extracao, persistencia e envio de activity no Freshsales.", items: [{ label: "Painel interno", helper: "O frontend centraliza as rotinas do modulo em /api/admin-hmadv-publicacoes.", endpoint: "/api/admin-hmadv-publicacoes", trigger: "Use para criar processos, extrair partes, sincronizar partes e drenar filas." }, { label: "Edge functions", helper: "publicacoes-freshsales e sync-worker cuidam do reflexo no CRM; datajud-search e tpu-sync complementam o enriquecimento.", endpoint: "_hmadv_review/supabase/functions/publicacoes-freshsales + sync-worker + datajud-search + tpu-sync", trigger: "Acione quando a publicacao precisar virar processo, activity ou enriquecimento posterior." }] },
  "/interno/financeiro": { title: "Financeiro: reflexo CRM e rastreio", subtitle: "Deals, eventos e conciliacao financeira precisam manter o rastro operacional visivel.", items: [{ label: "Painel interno", helper: "As rotas administrativas do financeiro concentram os disparos seguros do frontend.", endpoint: "/api/admin-hmadv-financeiro", trigger: "Use para publicar, reparar e auditar o reflexo de faturamento e deals." }, { label: "Freshsales", helper: "O CRM recebe updates por rotinas internas e eventuais webhooks externos conforme a esteira de deals.", endpoint: "functions/api/admin-hmadv-financeiro.js", trigger: "Acione sempre com console ligado para capturar payload, erro e resumo da remessa." }] },
  "/interno/ai-task": { title: "AI Task: orquestracao e observabilidade", subtitle: "Erros precisam ficar rastreaveis entre run, console e backend.", items: [{ label: "Painel interno", helper: "O modulo usa o backend administrativo do AI Task para execucao e captura de contexto.", endpoint: "/api/admin-lawdesk-chat", trigger: "Use para runs assistidas, automacao e investigacao de falhas da IA." }, { label: "Edge / embeddings", helper: "As rotas de embed e funcoes do Supabase complementam a trilha de IA quando houver dependencias vetoriais.", endpoint: "supabase/functions/dotobot-embed", trigger: "Acione quando a pipeline de contexto precisar regenerar embeddings ou depurar resposta do copiloto." }] },
  "/interno/market-ads": { title: "Market Ads: growth, compliance e campanha", subtitle: "Anuncios juridicos precisam unir inteligencia competitiva, operacao de midia e filtro etico no mesmo loop.", items: [{ label: "Painel interno", helper: "O cockpit administrativo do modulo parte de /api/admin-market-ads para benchmarks, previsoes e validacao de copy.", endpoint: "/api/admin-market-ads", trigger: "Use para carregar o dashboard, gerar preview de anuncio e validar compliance OAB antes da publicacao." }, { label: "Geracao assistida", helper: "A camada de IA produz headlines, descricoes, CTA, criativos sugeridos e keywords sempre com guarda juridica.", endpoint: "lib/admin/market-ads.js", trigger: "Acione quando precisar montar variacoes A/B, revisar copy ou preparar o handoff para integracoes futuras." }, { label: "Integracoes futuras", helper: "Google Ads, Meta Ads, analytics e landing pages devem convergir para uma mesma trilha de auditoria e otimizacao.", endpoint: "Google Ads API + Meta Marketing API + HMADV landing pages", trigger: "Acione quando o modulo sair do modo cockpit e passar a sincronizar campanhas reais com publicacao segura." }] },
};

export function getModuleIntegrationGuide(pathname = "") {
  return MODULE_INTEGRATION_GUIDES[pathname] || null;
}

export default function IntegrationGuideCard({ guide }) {
  const { isLightTheme } = useInternalTheme();
  if (!guide) return null;
  return (
    <section className={`rounded-[24px] border p-5 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#2D2E2E] bg-[rgba(10,12,11,0.58)]"}`}>
      <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C5A059]">Integracoes operacionais</p>
          <h3 className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F8F4EB]"}`}>{guide.title}</h3>
          {guide.subtitle ? <p className={`mt-2 max-w-4xl text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#99ADA6]"}`}>{guide.subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {guide.items.map((item) => (
          <div key={`${guide.title}-${item.label}`} className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F4E7C2]">{item.label}</p>
            <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{item.helper}</p>
            <p className={`mt-3 text-[11px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Endpoint / funcao</p>
            <p className="mt-1 break-all text-sm text-[#D9B46A]">{item.endpoint}</p>
            <p className={`mt-3 text-[11px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Quando acionar</p>
            <p className={`mt-1 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#99ADA6]"}`}>{item.trigger}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
