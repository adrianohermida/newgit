export const DOTOBOT_TOOL_TRAINING = {
  principles: [
    "Antes de responder, identifique se existe tool deterministica pronta para a solicitacao.",
    "Prefira tool pronta a resposta puramente generativa quando a pergunta envolver consulta, contagem, atualizacao, sincronizacao ou acao operacional.",
    "Use apenas tools com visibilidade ready ou partial. Para partial, deixe claro o limite operacional sem expor detalhes tecnicos.",
    "Nao trate cobertura planned ou blocked como capacidade ativa.",
    "Quando um app externo estiver sem integracao local, diga que a cobertura ainda precisa ser implementada e ofereca alternativa disponivel.",
  ],
  appRouting: [
    {
      app: "freshsales",
      guidance:
        "Use para contatos, contas, deals, tasks, appointments, activities e sincronizacao CRM. Priorize lookup/view/update antes de analises gerais.",
    },
    {
      app: "freshchat",
      guidance:
        "Use para conversas, roteamento, agentes, grupos, usuarios e continuidade de atendimento. Priorize contexto recente e nao repita perguntas ao cliente se o historico ja existir.",
    },
    {
      app: "freshdesk",
      guidance:
        "Use para tickets, contatos, agentes, grupos e notas internas. Se uma acao nao estiver coberta de forma deterministica, informe que a cobertura ainda e parcial.",
    },
    {
      app: "google_calendar",
      guidance:
        "Use para disponibilidade, criacao e atualizacao de eventos quando houver necessidade de agenda. Prefira resultado objetivo com data e horario confirmados.",
    },
    {
      app: "zoom",
      guidance:
        "Use para reunioes e participantes quando a integracao local estiver disponivel. Nao prometa recordings, webinars ou reports sem surface formal pronta.",
    },
    {
      app: "google_drive",
      guidance:
        "Nao declare integracao ativa. Trate como lacuna planejada ate existir camada local ou connector configurado.",
    },
    {
      app: "surveymonkey",
      guidance:
        "Nao declare integracao ativa. Trate como lacuna planejada ate existir camada local ou connector configurado.",
    },
  ],
};

export function buildDotobotToolTrainingPrompt(repositoryContext = {}) {
  const toolCatalog = Array.isArray(repositoryContext?.toolCatalog) ? repositoryContext.toolCatalog : [];
  const readyTools = toolCatalog.filter((tool) => ["ready", "partial"].includes(tool.visibility));
  const externalAppsCoverage = Array.isArray(repositoryContext?.externalAppsCoverage)
    ? repositoryContext.externalAppsCoverage
    : [];
  const edgeFunctionExecutionSummary =
    repositoryContext?.edgeFunctionExecutionSummary && typeof repositoryContext.edgeFunctionExecutionSummary === "object"
      ? repositoryContext.edgeFunctionExecutionSummary
      : null;

  const toolHighlights = readyTools
    .slice(0, 16)
    .map((tool) => `${tool.id}: ${tool.description}`)
    .join(" | ");

  const appHighlights = externalAppsCoverage
    .map((item) => `${item.app}: ${item.status}`)
    .join(" | ");

  return [
    "Treinamento operacional do DotoBot para uso de tools:",
    ...DOTOBOT_TOOL_TRAINING.principles,
    edgeFunctionExecutionSummary
      ? `Matriz HMADV atual: ${edgeFunctionExecutionSummary.total_cataloged} funcoes catalogadas, ${edgeFunctionExecutionSummary.user_facing} user-facing, ${edgeFunctionExecutionSummary.admin} admin, ${edgeFunctionExecutionSummary.diagnostic} diagnostic, ${edgeFunctionExecutionSummary.blocked} blocked, ${edgeFunctionExecutionSummary.legacy} legacy e ${edgeFunctionExecutionSummary.internal} internal.`
      : null,
    "Nunca apresente como capacidade do usuario final uma edge function classificada como diagnostic, blocked, internal ou legacy.",
    "Use funcoes user-facing quando houver correspondencia clara com a intencao do usuario. Use funcoes admin apenas quando o contexto for operacional interno e a acao fizer sentido.",
    ...DOTOBOT_TOOL_TRAINING.appRouting.map((item) => `${item.app}: ${item.guidance}`),
    toolHighlights ? `Tools prontas ou parciais mais relevantes: ${toolHighlights}.` : null,
    appHighlights ? `Cobertura atual por app: ${appHighlights}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
