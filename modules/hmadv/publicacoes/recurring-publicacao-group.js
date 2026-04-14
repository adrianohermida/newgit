import { ACTION_LABELS } from "./constants";
import { HealthBadge } from "./ui-primitives";

function recurringSourceTone(source) {
  if (source === "freshsales") return "warning";
  if (source === "advise" || source === "datajud") return "danger";
  return "default";
}

function recurringSourceLabel(source) {
  if (source === "freshsales") return "ajuste no CRM";
  if (source === "advise") return "origem da publicacao";
  if (source === "datajud") return "atualizacao judicial";
  return "ajuste de base";
}

function recurrenceBand(hits) {
  if (hits >= 4) return { label: "critico 4x+", tone: "danger" };
  if (hits >= 3) return { label: "reincidente 3x", tone: "warning" };
  if (hits >= 2) return { label: "recorrente 2x", tone: "default" };
  return null;
}

function RecurringPublicacaoItem({ item }) {
  const band = recurrenceBand(item.hits);
  return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-semibold break-all">{item.key}</p>
      <HealthBadge label={`${item.hits} ciclos`} tone="danger" />
      {band ? <HealthBadge label={band.label} tone={band.tone} /> : null}
      <HealthBadge label={ACTION_LABELS[item.lastAction] || item.lastAction} tone="warning" />
      <HealthBadge label={recurringSourceLabel(item.source)} tone={recurringSourceTone(item.source)} />
      {item.noProgress ? <HealthBadge label="sem progresso relevante" tone="warning" /> : null}
      {item.needsManualReview ? <HealthBadge label="precisa revisao manual" tone="danger" /> : null}
      {item.nextAction ? <HealthBadge label={item.nextAction} tone="success" /> : null}
    </div>
    {item.titulo ? <p className="mt-2 opacity-70">{item.titulo}</p> : null}
  </div>;
}

export function RecurringPublicacaoGroup({ title, helper, items }) {
  if (!items.length) return null;
  return <div className="space-y-3">
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs opacity-60">{helper}</p>
    </div>
    <div className="space-y-3">
      {items.map((item) => <RecurringPublicacaoItem key={item.key} item={item} />)}
    </div>
  </div>;
}
