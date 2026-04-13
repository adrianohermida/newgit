import { ActionButton, Field, Panel, Tag, TextAreaField, toneFor } from "./shared";

export default function CompliancePanel({
  complianceInput,
  setComplianceInput,
  complianceState,
  complianceResult,
  validateCompliance,
}) {
  return (
    <Panel eyebrow="Filtro juridico" title="Validador OAB" helper="Revise headline, descricao e CTA antes de publicar para manter sobriedade, informacao e conformidade.">
      <div className="space-y-4">
        <Field label="Headline" value={complianceInput.headline} onChange={(event) => setComplianceInput({ ...complianceInput, headline: event.target.value })} />
        <TextAreaField label="Descricao" value={complianceInput.description} onChange={(event) => setComplianceInput({ ...complianceInput, description: event.target.value })} rows={5} />
        <Field label="CTA" value={complianceInput.cta} onChange={(event) => setComplianceInput({ ...complianceInput, cta: event.target.value })} />
        <ActionButton tone="ghost" onClick={validateCompliance} disabled={complianceState.loading}>
          {complianceState.loading ? "Validando..." : "Validar compliance"}
        </ActionButton>
      </div>

      {complianceResult ? (
        <div className="mt-5 space-y-3">
          <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.03)] p-4">
            <div className="flex flex-wrap gap-2">
              <Tag tone={toneFor(complianceResult.status)}>{complianceResult.status}</Tag>
              <Tag tone="accent">score {complianceResult.score}</Tag>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#8DA19A]">{complianceResult.guidance}</p>
            {complianceResult.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{complianceResult.warning}</p> : null}
          </div>
          {complianceResult.violations?.map((item) => (
            <div key={`${item.ruleId}-${item.offendingPattern}`} className="rounded-[18px] border border-[#4B2E2F] bg-[rgba(53,18,18,0.26)] p-4">
              <div className="flex flex-wrap gap-2">
                <Tag tone="danger">{item.label}</Tag>
                <Tag tone="warn">{item.severity}</Tag>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#DABABA]">{item.message}</p>
            </div>
          ))}
          <TextAreaField label="Reescrita sugerida" value={complianceResult.revisedCopy} rows={5} readOnly />
        </div>
      ) : null}
    </Panel>
  );
}
