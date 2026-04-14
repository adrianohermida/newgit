import { RecurringPublicacaoGroup } from "./recurring-publicacao-group";

export function deriveRemoteHealth(history = []) {
  const latest = history[0] || null;
  if (!latest) return [];
  const sameAction = history.filter((item) => item.acao === latest.acao).slice(0, 3);
  const badges = [];
  if (latest.status === "error") badges.push({ label: "ultima execucao com erro", tone: "danger" });
  if (Number(latest.affected_count || 0) === 0) badges.push({ label: "sem progresso", tone: "warning" });
  if (sameAction.length >= 2 && sameAction.every((item) => Number(item.affected_count || 0) === 0)) badges.push({ label: "fila reincidente", tone: "danger" });
  if (!badges.length && latest.status === "success") badges.push({ label: "ciclo saudavel", tone: "success" });
  return badges;
}
export function deriveRecurringPublicacoes(history = []) {
  const counts = new Map();
  for (const entry of history.slice(0, 6)) {
    const rows = Array.isArray(entry?.result_sample) ? entry.result_sample : [];
    for (const row of rows) {
      const key = row?.numero_cnj || row?.processo_id || row?.id;
      if (!key) continue;
      const current = counts.get(key) || {
        key,
        titulo: row?.titulo || row?.titulo_processo || "",
        hits: 0,
        lastAction: entry.acao,
        source: "advise",
        needsManualReview: false,
        noProgress: false,
        nextAction: "atualizar integracoes",
      };
      current.hits += 1;
      if (!current.titulo && (row?.titulo || row?.titulo_processo)) current.titulo = row?.titulo || row?.titulo_processo;
      current.lastAction = entry.acao;
      current.source = classifyPublicacaoRecurringSource(entry, row);
      current.needsManualReview = current.needsManualReview || publicacaoNeedsManualReview(row);
      current.noProgress = current.noProgress || publicacaoHasNoProgress(entry, row);
      current.nextAction = suggestPublicacaoNextAction(current.source, row, current);
      counts.set(key, current);
    }
  }
  return Array.from(counts.values()).filter((item) => item.hits > 1).sort((a, b) => b.hits - a.hits).slice(0, 8);
}
export function summarizeRecurringPublicacoes(items = []) {
  return items.reduce((acc, item) => {
    acc.total += 1;
    acc[item.source] = (acc[item.source] || 0) + 1;
    if (item.needsManualReview) acc.manual += 1;
    if (item.noProgress) acc.stagnant += 1;
    return acc;
  }, { total: 0, supabase: 0, freshsales: 0, datajud: 0, advise: 0, manual: 0, stagnant: 0 });
}
function classifyPublicacaoRecurringSource(entry, row) {
  if (entry?.acao === "run_sync_worker") return "freshsales";
  if (entry?.acao === "criar_processos_publicacoes") return "advise";
  if (row?.accountsReparadas || row?.freshsales_repair) return "freshsales";
  if ((row?.partes_detectadas || row?.partes_novas || 0) > 0 || row?.publicacoes_lidas > 0) return "advise";
  return "supabase";
}
function publicacaoNeedsManualReview(row) {
  return Boolean(row?.erro || row?.freshsales_repair?.ok === false || row?.freshsales_repair?.skipped);
}

function publicacaoHasNoProgress(entry, row) {
  if (Number(entry?.affected_count || 0) === 0) return true;
  return Number(row?.partesInseridas || 0) === 0 && Number(row?.processosAtualizados || 0) === 0 && Number(row?.accountsReparadas || 0) === 0 && !row?.processo_criado;
}
export function summarizeRecurrenceBands(items = []) {
  return items.reduce((acc, item) => {
    if (item.hits >= 4) acc.critical += 1;
    else if (item.hits >= 3) acc.reincident += 1;
    else if (item.hits >= 2) acc.recurring += 1;
    return acc;
  }, { recurring: 0, reincident: 0, critical: 0 });
}

export function groupRecurringPublicacoes(items = []) {
  return {
    critical: items.filter((item) => item.hits >= 4),
    reincident: items.filter((item) => item.hits === 3),
    recurring: items.filter((item) => item.hits === 2),
  };
}

export function deriveRecurringPublicacoesFocus(summary, bands) {
  if (bands.critical > 0) return { title: "Prioridade imediata", body: "Existem publicacoes 4x+ reaparecendo. Priorize o bloqueio recorrente antes de ampliar o lote." };
  if (summary.manual > 0) return { title: "Revisao manual prioritaria", body: "Ha publicacoes que continuam pedindo leitura humana ou ajuste de regra." };
  if (summary.advise > 0) return { title: "Criar processos ausentes primeiro", body: "O principal bloqueio recorrente esta em publicacoes ainda sem processo vinculado." };
  if (summary.freshsales > 0) return { title: "Atualizar processos vinculados", body: "A recorrencia esta concentrada no reflexo das publicacoes para atividades do CRM." };
  if (summary.stagnant > 0) return { title: "Revisar lote sem progresso", body: "Ha recorrencias sem ganho util. Revise selecao, regra de extracao e limite do lote." };
  return { title: "Ciclo sob controle", body: "As recorrencias atuais parecem estaveis e podem ser tratadas com lotes menores e correcoes pontuais." };
}

export function deriveSuggestedPublicacoesBatch(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return { size: 5, reason: "Use lote minimo para validar regra e evitar retrabalho em massa." };
  if (summary.advise > 0 || summary.freshsales > 0) return { size: 10, reason: "Use lote curto para medir criacao de processo e reflexo no CRM." };
  if (summary.stagnant > 0) return { size: 8, reason: "Reduza o lote para isolar por que a fila nao esta ganhando progresso." };
  return { size: 20, reason: "A fila parece sob controle para uma rodada padrao." };
}

export function deriveSuggestedPublicacoesActions(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return ["Criar processos a partir das publicacoes", "Atualizar publicacoes vinculadas", "Revisar publicacoes reincidentes"];
  if (summary.advise > 0) return ["Criar processos a partir das publicacoes", "Atualizar publicacoes vinculadas", "Atualizar integracoes do CRM"];
  if (summary.freshsales > 0) return ["Atualizar publicacoes vinculadas", "Atualizar integracoes do CRM"];
  if (summary.stagnant > 0) return ["Criar processos a partir das publicacoes", "Atualizar publicacoes vinculadas"];
  return ["Atualizar publicacoes vinculadas", "Criar processos a partir das publicacoes"];
}

export function derivePrimaryPublicacoesAction(actions = []) {
  return actions[0] || "Atualizar publicacoes vinculadas";
}

export function deriveSuggestedPublicacoesChecklist(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) {
    return [
      "Revise primeiro a amostra das publicacoes criticas.",
      "Crie primeiro os processos ausentes em lote minimo.",
      "So depois sincronize as publicacoes dos processos vinculados.",
    ];
  }
  if (summary.advise > 0) {
    return [
      "Crie os processos faltantes a partir das publicacoes.",
      "Atualize as publicacoes dos processos que ja possuem conta vinculada.",
      "Use o modulo de processos se precisar extrair ou reconciliar partes.",
    ];
  }
  if (summary.freshsales > 0) {
    return [
      "Sincronize primeiro as publicacoes vinculadas selecionadas.",
      "Atualize as integracoes em lote curto apenas para pendencias residuais.",
      "Confirme que as atividades passaram a refletir no CRM.",
    ];
  }
  return [
    "Execute a trilha principal em lote controlado.",
    "Reavalie os itens sem progresso antes de ampliar a rodada.",
    "Aumente o lote apenas quando o ganho vier consistente.",
  ];
}

function suggestPublicacaoNextAction(source, row, current) {
  if (current?.needsManualReview) return "revisar manualmente a publicacao";
  if (source === "freshsales") return "atualizar integracoes";
  if (source === "advise") {
    if (!row?.processo_criado && !row?.processo_depois) return "criar processo da publicacao";
    return "sincronizar publicacao vinculada";
  }
  if (current?.noProgress) return "revisar fila de publicacoes";
  return "sincronizar publicacao vinculada";
}
