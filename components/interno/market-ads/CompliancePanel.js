import { Panel, Tag, toneFor } from "./shared";

export default function CompliancePanel({
  complianceInput,
  setComplianceInput,
  complianceState,
  complianceResult,
  validateCompliance,
}) {
  return (
    <Panel eyebrow="Filtro juridico" title="Validador de compliance OAB" helper="Bloqueia linguagem vedada e sugere reescrita para manter discricao, sobriedade e carater informativo.">
      <div className="space-y-4">
        <input value={complianceInput.headline} onChange={(event) => setComplianceInput({ ...complianceInput, headline: event.target.value })} className="w-full rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Headline" />
        <textarea value={complianceInput.description} onChange={(event) => setComplianceInput({ ...complianceInput, description: event.target.value })} rows={5} className="w-full rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Descricao" />
        <input value={complianceInput.cta} onChange={(event) => setComplianceInput({ ...complianceInput, cta: event.target.value })} className="w-full rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CTA" />
        <button type="button" onClick={validateCompliance} disabled={complianceState.loading} className="rounded-full border border-[#C5A059] px-5 py-3 text-sm font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E] disabled:opacity-50">
          {complianceState.loading ? "Validando..." : "Validar compliance"}
        </button>
      </div>
      {complianceResult ? (
        <div className="mt-5 space-y-3">
          <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
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
          <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">Reescrita sugerida</p>
            <p className="mt-2 text-sm leading-6 text-[#D5DED8]">{complianceResult.revisedCopy}</p>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
