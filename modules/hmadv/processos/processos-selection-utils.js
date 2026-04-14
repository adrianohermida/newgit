export function deriveSelectionActionHint({
  selectedWithoutMovements = [],
  selectedMovementBacklog = [],
  selectedPublicationBacklog = [],
  selectedPartesBacklog = [],
  selectedAudienciaCandidates = [],
  selectedMonitoringActive = [],
  selectedMonitoringInactive = [],
  selectedFieldGaps = [],
  selectedOrphans = [],
  monitoringUnsupported = false,
}) {
  if (selectedOrphans.length) return { title: "Criar contas primeiro", body: "Ha processos sem conta comercial selecionados. Priorize a criacao dessas contas para liberar as proximas etapas.", badges: [`${selectedOrphans.length} sem conta`, "acao: criar contas"] };
  if (selectedFieldGaps.length) return { title: "Ajustar CRM agora", body: "Os itens selecionados ainda precisam de ajuste entre a base interna e o CRM. O melhor proximo passo e corrigir os dados antes de atualizar novamente.", badges: [`${selectedFieldGaps.length} ajustes`, "acao: corrigir crm"] };
  if (selectedWithoutMovements.length) return { title: "Buscar movimentacoes no DataJud", body: "A selecao atual esta concentrada em processos sem andamento local. Reenriquecer pelo DataJud tende a gerar o maior ganho.", badges: [`${selectedWithoutMovements.length} sem mov.`, "acao: datajud"] };
  if (selectedMovementBacklog.length) return { title: "Atualizar andamentos no CRM", body: "Os processos selecionados ja tem andamentos, mas ainda faltam reflexos no CRM. Vale priorizar essa atualizacao antes de novos lotes amplos.", badges: [`${selectedMovementBacklog.length} com andamentos pendentes`, "acao: sync movimentacoes"] };
  if (selectedPublicationBacklog.length) return { title: "Atualizar publicacoes no CRM", body: "Os processos selecionados ainda tem publicacoes sem reflexo no CRM. Vale atualizar esse historico antes de novas rodadas amplas.", badges: [`${selectedPublicationBacklog.length} com publicacoes pendentes`, "acao: sync publicacoes"] };
  if (selectedPartesBacklog.length) return { title: "Reconciliar partes com contatos", body: "Os processos selecionados ainda tem partes sem contato no CRM. A conciliacao reduz perda de contexto no produto e no portal.", badges: [`${selectedPartesBacklog.length} com partes pendentes`, "acao: reconciliar contatos"] };
  if (selectedAudienciaCandidates.length) return { title: "Retroagir audiencias agora", body: "Ha processos com audiencias detectadas nas publicacoes e ainda pendentes de persistencia. Vale priorizar essa fila antes de novas rodadas amplas.", badges: [`${selectedAudienciaCandidates.length} com audiencias`, "acao: retroagir audiencias"] };
  if (selectedMonitoringInactive.length) return { title: monitoringUnsupported ? "Estrutura de monitoramento pendente" : "Retomar monitoramento", body: monitoringUnsupported ? "A fila esta em leitura assistida: a coluna monitoramento_ativo ainda nao esta disponivel na base, entao novas gravacoes ficam temporariamente pausadas." : "Ha processos fora do acompanhamento automatico. Retome o monitoramento para manter a carteira atualizada.", badges: [`${selectedMonitoringInactive.length} itens`, monitoringUnsupported ? "somente leitura" : "acao: ativar"] };
  if (selectedMonitoringActive.length) return monitoringUnsupported ? { title: "Estrutura de monitoramento pendente", body: "A leitura de monitoramento ativo esta em modo auxiliar e serve apenas para diagnostico. Acoes em lote ficam liberadas assim que a estrutura for concluida.", badges: [`${selectedMonitoringActive.length} itens`, "somente leitura"] } : { title: "Atualizar itens monitorados", body: "A selecao atual ja esta em acompanhamento. Vale priorizar atualizacao de andamentos e audiencias nesse recorte.", badges: [`${selectedMonitoringActive.length} monitorados`, "acao: sincronizar"] };
  return { title: "Selecione uma fila para priorizar", body: "Use as filas para organizar a proxima rodada e o painel destaca automaticamente a acao mais util.", badges: ["sem selecao ativa"] };
}

export function buildSelectionSuggestedAction({
  selectedWithoutMovements = [],
  selectedMovementBacklog = [],
  selectedPublicationBacklog = [],
  selectedPartesBacklog = [],
  selectedAudienciaCandidates = [],
  selectedMonitoringActive = [],
  selectedMonitoringInactive = [],
  selectedFieldGaps = [],
  selectedOrphans = [],
  monitoringUnsupported = false,
  withoutMovements = [],
  movementBacklog = [],
  publicationBacklog = [],
  partesBacklog = [],
  audienciaCandidates = [],
  monitoringActive = [],
  monitoringInactive = [],
  fieldGaps = [],
  orphans = [],
  resolveActionProcessNumbers,
  getSelectedNumbers,
  limit,
}) {
  if (selectedOrphans.length) return { key: "push_orfaos", label: "Criar contas agora", tone: "primary", payload: { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(orphans, selectedOrphans).join("\n")), limit } };
  if (selectedFieldGaps.length) return { key: "repair_freshsales_accounts", label: "Corrigir CRM agora", tone: "primary", payload: { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps, selectedFieldGaps).join("\n")), limit } };
  if (selectedWithoutMovements.length) return { key: "enriquecer_datajud", intent: "buscar_movimentacoes", label: "Buscar atualizacoes agora", tone: "primary", payload: { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(withoutMovements, selectedWithoutMovements).join("\n")), limit, intent: "buscar_movimentacoes", action: "enriquecer_datajud" } };
  if (selectedMovementBacklog.length) return { key: "sincronizar_movimentacoes_activity", label: "Atualizar andamentos agora", tone: "primary", payload: { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog, selectedMovementBacklog).join("\n")), limit } };
  if (selectedPublicationBacklog.length) return { key: "sincronizar_publicacoes_activity", label: "Atualizar publicacoes agora", tone: "primary", payload: { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog, selectedPublicationBacklog).join("\n")), limit } };
  if (selectedPartesBacklog.length) return { key: "reconciliar_partes_contatos", label: "Reconciliar partes agora", tone: "primary", payload: { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog, selectedPartesBacklog).join("\n")), limit } };
  if (selectedAudienciaCandidates.length) return { key: "backfill_audiencias", label: "Retroagir audiencias agora", tone: "primary", payload: { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(audienciaCandidates, selectedAudienciaCandidates).join("\n")), limit, apply: true } };
  if (selectedMonitoringInactive.length) return monitoringUnsupported ? { key: "monitoramento_status", label: "Estrutura pendente para monitoramento", tone: "subtle", disabled: true } : { key: "monitoramento_status", label: "Ativar monitoramento agora", tone: "primary", payload: { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringInactive, selectedMonitoringInactive).join("\n")), active: true, limit } };
  if (selectedMonitoringActive.length) return monitoringUnsupported ? { key: "monitoramento_schema", label: "Estrutura pendente de conclusao", tone: "subtle", disabled: true } : { key: "enriquecer_datajud", intent: "sincronizar_monitorados", label: "Atualizar monitorados agora", tone: "primary", payload: { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive, selectedMonitoringActive).join("\n")), limit, intent: "sincronizar_monitorados", action: "enriquecer_datajud" } };
  return null;
}
