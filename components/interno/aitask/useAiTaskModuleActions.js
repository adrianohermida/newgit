import { useEffect } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { getModuleHistory } from "../../../lib/admin/activity-log";
import { hasExplicitBrowserLocalRuntimeOptIn } from "../../../lib/lawdesk/browser-local-runtime";
import { extractFirstEmail } from "./aiTaskMissionBlueprint";
import { normalizeAiTaskProviderSelection } from "./aiTaskModuleConfig";

export default function useAiTaskModuleActions(props) {
  const { automation, contact360Query, contextSnapshot, handleCopySupabaseLocalEnvBlock, localStackReady, mission, provider, providerCatalog, pushLog, router, setContact360, setContact360Loading, setContact360Query, setContextSnapshot, setLocalRuntimeConfigOpen, setMission, setMode, setProvider, setShowContext } = props;

  useEffect(() => {
    if (contact360Query) return;
    const documentEmails = Array.isArray(contextSnapshot?.documents) ? contextSnapshot.documents.map((item) => item?.email).filter(Boolean).join(" ") : "";
    const seededEmail = extractFirstEmail(mission) || extractFirstEmail(contextSnapshot?.selectedAction?.mission) || extractFirstEmail(documentEmails);
    if (seededEmail) setContact360Query(seededEmail);
  }, [contact360Query, contextSnapshot?.documents, contextSnapshot?.selectedAction?.mission, mission, setContact360Query]);

  useEffect(() => {
    if (contextSnapshot?.selectedAction || mission) return;
    const handoff = getModuleHistory("ai-task")?.handoffFromDotobot || null;
    if (!handoff?.mission) return;
    setMission(handoff.mission);
    setMode(["assisted", "auto", "manual"].includes(handoff.mode) ? handoff.mode : "assisted");
    const nextProvider = handoff.provider || "gpt";
    setProvider(normalizeAiTaskProviderSelection(localStackReady && hasExplicitBrowserLocalRuntimeOptIn() && (nextProvider === "gpt" || nextProvider === "cloudflare") ? "local" : nextProvider, providerCatalog));
    setShowContext(true);
    setContextSnapshot((current) => ({ ...(current || {}), module: handoff.moduleKey || current?.module || "dotobot", moduleLabel: handoff.moduleLabel || "Dotobot", route: handoff.routePath || "/interno/ai-task", routePath: handoff.routePath || "/interno/ai-task", consoleTags: handoff.tags || ["ai-task", "dotobot"], selectedAction: { id: handoff.id || "dotobot_handoff", label: handoff.label || "Handoff do Dotobot", mission: handoff.mission, moduleLabel: handoff.moduleLabel || "Dotobot" } }));
  }, [contextSnapshot?.selectedAction, localStackReady, mission, providerCatalog, setContextSnapshot, setMission, setMode, setProvider, setShowContext]);

  function handleOpenLlmTest() {
    const query = { provider };
    if (mission) query.prompt = mission.slice(0, 300);
    router.push({ pathname: "/llm-test", query });
  }

  function handleOpenDiagnostics() {
    router.push("/interno/agentlab/environment");
  }

  function handleOpenDotobot() {
    router.push("/interno");
  }

  function handleLocalStackAction(actionId) {
    if (actionId === "open_llm_test" || actionId === "testar_llm_local") return handleOpenLlmTest();
    if (actionId === "copiar_envs_supabase_local") return handleCopySupabaseLocalEnvBlock();
    if (actionId === "open_runtime_config") return setLocalRuntimeConfigOpen(true);
    if (actionId === "abrir_diagnostico" || actionId === "diagnose_supabase_local" || actionId === "open_environment") return handleOpenDiagnostics();
    if (actionId === "open_ai_task") router.push("/interno/ai-task");
  }

  async function handleLoadContact360() {
    const email = String(contact360Query || "").trim();
    if (!email) return;
    setContact360Loading(true);
    try {
      const payload = await adminFetch("/api/freddy-get-contact-360", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      setContact360(payload || null);
      pushLog({ type: "api", action: "contact_360_loaded", result: payload?.data?.summary || `Contexto 360 carregado para ${email}.` });
    } catch (loadError) {
      setContact360({ ok: false, error: loadError?.message || "Falha ao consultar contexto 360." });
      pushLog({ type: "error", action: "contact_360_failed", result: loadError?.message || "Falha ao consultar contexto 360." });
    } finally {
      setContact360Loading(false);
    }
  }

  function handleApprove(executeMission) {
    props.setApproved(true);
    pushLog({ type: "control", action: "Aprovacao concedida", result: "A missao recebeu permissao para seguir." });
    if (automation === "waiting_approval") executeMission(mission);
  }

  return { handleApprove, handleLoadContact360, handleLocalStackAction, handleOpenDiagnostics, handleOpenDotobot, handleOpenLlmTest };
}
