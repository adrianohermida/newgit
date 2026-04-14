import { Panel } from "./ui-primitives";

export default function ProcessosCoveragePanel({
  isLightTheme,
  processCoverage,
  coverageMismatchMessage,
  CoverageList,
  covPage,
  setCovPage,
  useCoverageProcess,
}) {
  const warningTone = isLightTheme
    ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]"
    : "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#F8E7B5]";
  const errorTone = isLightTheme
    ? "border-[#E7C4C4] bg-[#FFF4F4] text-[#B25E5E]"
    : "border-[#4B2222] bg-[rgba(75,34,34,0.18)] text-[#FECACA]";

  return (
    <Panel title="Cobertura por processo" eyebrow="Auditoria local">
      {processCoverage.unsupported ? (
        <div className={`rounded-[22px] border border-dashed p-4 text-sm ${warningTone}`}>
          O schema de cobertura ainda nao foi aplicado no HMADV. Assim que a migracao estiver ativa, esta leitura vai mostrar o percentual real de cobertura por processo.
        </div>
      ) : (
        <div className="space-y-4">
          {processCoverage.limited ? <div className={`rounded-[20px] border p-4 text-sm ${warningTone}`}>A leitura de cobertura entrou em modo reduzido para evitar sobrecarga. Os totais continuam uteis, mas a pagina atual pode vir parcial.</div> : null}
          {processCoverage.error ? <div className={`rounded-[20px] border p-4 text-sm ${errorTone}`}>{processCoverage.error}</div> : null}
          {!processCoverage.loading && Number(processCoverage.totalRows || 0) > 0 && !(processCoverage.items || []).length ? (
            <div className={`rounded-[20px] border p-4 text-sm ${warningTone}`}>{coverageMismatchMessage(processCoverage)}</div>
          ) : null}
          <CoverageList rows={processCoverage.items} page={covPage} setPage={setCovPage} loading={processCoverage.loading} totalRows={processCoverage.totalRows} pageSize={processCoverage.pageSize} onSelectProcess={useCoverageProcess} />
        </div>
      )}
    </Panel>
  );
}
