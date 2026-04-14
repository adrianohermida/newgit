import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { ACTION_LABELS } from "./constants";
import { StatusBadge } from "./ui-primitives";

function hasJsonTruncationMessage(value) {
  return /unexpected end of json input/i.test(String(value || ""));
}

export function deriveRemoteHealth(history = []) {
  const latest = history[0] || null;
  if (!latest) return [];
  const sameAction = history.filter((item) => item.acao === latest.acao).slice(0, 3);
  const badges = [];
  const latestRows = Array.isArray(latest?.result_sample) ? latest.result_sample : [];
  const truncationErrors = latestRows.filter((row) => hasJsonTruncationMessage(row?.detalhe)).length;
  if (latest.status === "error") badges.push({ label: "ultima execucao com erro", tone: "danger" });
  if (Number(latest.affected_count || 0) === 0) badges.push({ label: "sem progresso", tone: "warning" });
  if (sameAction.length >= 2 && sameAction.every((item) => Number(item.affected_count || 0) === 0)) badges.push({ label: "fila reincidente", tone: "danger" });
  if (truncationErrors) badges.push({ label: "upstream json truncado", tone: "danger" });
  if (!badges.length && latest.status === "success") badges.push({ label: "ciclo saudavel", tone: "success" });
  return badges;
}

export function deriveRecurringProcessEntries(history = []) {
  const counts = new Map();
  for (const entry of history.slice(0, 6)) {
    const rows = Array.isArray(entry?.result_sample) ? entry.result_sample : [];
    for (const row of rows) {
      const key = row?.numero_cnj || row?.id || row?.processo_id;
      if (!key) continue;
      const current = counts.get(key) || {
        key,
        titulo: row?.titulo || "",
        hits: 0,
        lastAction: entry.acao,
        source: "supabase",
        needsManualReview: false,
        noProgress: false,
        nextAction: "rodar auditoria",
      };
      current.hits += 1;
      if (!current.titulo && row?.titulo) current.titulo = row.titulo;
      current.lastAction = entry.acao;
      current.source = classifyProcessRecurringSource(entry, row);
      current.needsManualReview = current.needsManualReview || processNeedsManualReview(row);
      current.noProgress = current.noProgress || processHasNoProgress(entry, row);
      current.nextAction = suggestProcessNextAction(current.source, row, current);
      counts.set(key, current);
    }
  }
  return Array.from(counts.values()).filter((item) => item.hits > 1).sort((a, b) => b.hits - a.hits).slice(0, 8);
}

export function summarizeRecurringProcessEntries(items = []) {
  return items.reduce((acc, item) => {
    acc.total += 1;
    acc[item.source] = (acc[item.source] || 0) + 1;
    if (item.needsManualReview) acc.manual += 1;
    if (item.noProgress) acc.stagnant += 1;
    return acc;
  }, { total: 0, supabase: 0, freshsales: 0, datajud: 0, advise: 0, manual: 0, stagnant: 0 });
}

function classifyProcessRecurringSource(entry, row) {
  if (entry?.acao === "enriquecer_datajud") return "datajud";
  if (row?.freshsales_repair || entry?.acao === "repair_freshsales_accounts" || entry?.acao === "push_orfaos") return "freshsales";
  if (row?.quantidade_movimentacoes === 0 || row?.before?.quantidade_movimentacoes === row?.after?.quantidade_movimentacoes) return "datajud";
  if (row?.monitoramento_ativo === false) return "supabase";
  return "supabase";
}

function processNeedsManualReview(row) {
  return Boolean(row?.result?.ok === false || row?.datajud?.ok === false || row?.freshsales_repair?.ok === false || row?.freshsales_repair?.skipped);
}

function processHasNoProgress(entry, row) {
  if (Number(entry?.affected_count || 0) === 0) return true;
  return Number(row?.movimentos_novos || 0) === 0 && Number(row?.gaps_reduzidos || 0) === 0 && !row?.freshsales_repair;
}

function sourceTone(source) {
  if (source === "freshsales") return "warning";
  if (source === "datajud") return "danger";
  if (source === "advise") return "warning";
  return "default";
}

function sourceLabel(source) {
  if (source === "freshsales") return "ajuste no CRM";
  if (source === "datajud") return "atualizacao judicial";
  if (source === "advise") return "origem de publicacao";
  return "ajuste de base";
}

function recurrenceBand(hits) {
  if (hits >= 4) return { label: "critico 4x+", tone: "danger" };
  if (hits >= 3) return { label: "reincidente 3x", tone: "warning" };
  if (hits >= 2) return { label: "recorrente 2x", tone: "default" };
  return null;
}

export function summarizeRecurrenceBands(items = []) {
  return items.reduce((acc, item) => {
    if (item.hits >= 4) acc.critical += 1;
    else if (item.hits >= 3) acc.reincident += 1;
    else if (item.hits >= 2) acc.recurring += 1;
    return acc;
  }, { recurring: 0, reincident: 0, critical: 0 });
}

export function groupRecurringProcessEntries(items = []) {
  return {
    critical: items.filter((item) => item.hits >= 4),
    reincident: items.filter((item) => item.hits === 3),
    recurring: items.filter((item) => item.hits === 2),
  };
}

export function deriveRecurringProcessFocus(summary, bands) {
  if (bands.critical > 0) return { title: "Prioridade imediata", body: "Existem itens 4x+ reaparecendo. Priorize bloqueios cronicos antes de rodar novos lotes amplos." };
  if (summary.manual > 0) return { title: "Revisao manual prioritaria", body: "Ha casos que continuam pedindo intervencao humana. Vale revisar retorno e regra antes de repetir a fila." };
  if (summary.freshsales > 0) return { title: "Ajustar CRM primeiro", body: "Os bloqueios recorrentes estao concentrados no CRM. Priorize criacao de conta e ajuste de dados." };
  if (summary.datajud > 0) return { title: "Atualizar via DataJud", body: "O principal bloqueio recorrente esta no enriquecimento ou nas atualizacoes vindas do DataJud." };
  if (summary.stagnant > 0) return { title: "Revisar lote sem progresso", body: "Ha recorrencias sem ganho util. Revise selecao, regra e cobertura antes de insistir no mesmo lote." };
  return { title: "Ciclo sob controle", body: "As recorrencias atuais parecem estaveis e podem ser tratadas pela fila normal com lotes menores." };
}

export function deriveSuggestedProcessBatch(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return { size: 5, reason: "Use lote minimo para validar correcao estrutural ou manual." };
  if (summary.freshsales > 0 || summary.datajud > 0) return { size: 10, reason: "Use lote curto para medir ganho antes de ampliar a rodada." };
  if (summary.stagnant > 0) return { size: 8, reason: "Reduza o lote para isolar por que a fila nao esta progredindo." };
  return { size: 20, reason: "A fila parece sob controle para um lote padrao." };
}

export function deriveSuggestedProcessActions(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return ["Rodar auditoria", "Atualizar base comercial", "Buscar atualizacoes no DataJud"];
  if (summary.freshsales > 0) return ["Criar contas comerciais", "Corrigir dados comerciais", "Atualizar base comercial"];
  if (summary.datajud > 0) return ["Buscar atualizacoes no DataJud", "Atualizar dados judiciais", "Atualizar base comercial"];
  if (summary.stagnant > 0) return ["Rodar auditoria", "Atualizar base comercial"];
  return ["Atualizar base comercial", "Atualizar integracoes"];
}

export function derivePrimaryProcessAction(actions = []) {
  return actions[0] || "Atualizar base comercial";
}

export function deriveSuggestedProcessChecklist(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) {
    return [
      "Revise primeiro a amostra reincidente antes de ampliar o lote.",
      "Rode um lote curto de atualizacao da base comercial.",
      "Se ainda faltar progresso, reconsulte atualizacoes no DataJud.",
    ];
  }
  if (summary.freshsales > 0) {
    return [
      "Crie ou recupere as contas comerciais ausentes.",
      "Rode a correcao de dados no CRM.",
      "Feche o ciclo com atualizacao da base comercial.",
    ];
  }
  if (summary.datajud > 0) {
    return [
      "Busque atualizacoes para os processos mais vazios.",
      "Reenriqueca os campos DataJud do lote curto.",
      "Atualize o resultado consolidado no CRM.",
    ];
  }
  return [
    "Execute a atualizacao principal em lote controlado.",
    "Revise os itens que permanecerem sem progresso.",
    "Aumente o lote apenas se o ganho vier consistente.",
  ];
}

function suggestProcessNextAction(source, row, current) {
  if (current?.needsManualReview) return "revisar manualmente o retorno";
  if (source === "freshsales") {
    if (!row?.account_id_freshsales) return "criar conta comercial";
    return "corrigir dados no CRM";
  }
  if (source === "datajud") {
    if (row?.quantidade_movimentacoes === 0 || row?.before?.quantidade_movimentacoes === row?.after?.quantidade_movimentacoes) {
      return "buscar atualizacoes no datajud";
    }
    return "atualizar dados via datajud";
  }
  if (row?.monitoramento_ativo === false) return "reativar monitoramento";
  if (current?.noProgress) return "rodar auditoria do lote";
  return "atualizar base comercial";
}

function RecurringProcessItem({ item }) {
  const { isLightTheme } = useInternalTheme();
  return <div className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-semibold break-all">{item.key}</p>
      <StatusBadge tone="danger">{item.hits} ciclos</StatusBadge>
      {recurrenceBand(item.hits) ? <StatusBadge tone={recurrenceBand(item.hits).tone}>{recurrenceBand(item.hits).label}</StatusBadge> : null}
      <StatusBadge tone="warning">{ACTION_LABELS[item.lastAction] || item.lastAction}</StatusBadge>
      <StatusBadge tone={sourceTone(item.source)}>{sourceLabel(item.source)}</StatusBadge>
      {item.noProgress ? <StatusBadge tone="warning">sem progresso relevante</StatusBadge> : null}
      {item.needsManualReview ? <StatusBadge tone="danger">precisa revisao manual</StatusBadge> : null}
      {item.nextAction ? <StatusBadge tone="success">{item.nextAction}</StatusBadge> : null}
    </div>
    {item.titulo ? <p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{item.titulo}</p> : null}
  </div>;
}

export function RecurringProcessGroup({ title, helper, items }) {
  const { isLightTheme } = useInternalTheme();
  if (!items.length) return null;
  return <div className="space-y-3">
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{helper}</p>
    </div>
    <div className="space-y-3">
      {items.map((item) => <RecurringProcessItem key={item.key} item={item} />)}
    </div>
  </div>;
}
