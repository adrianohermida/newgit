import Link from "next/link";
import InternoLayout from "../InternoLayout";
import IntegrationKitPanel from "./IntegrationKitPanel";
import { useIntegrationKitData } from "./useIntegrationKitData";

function downloadText(filename, content, contentType = "application/json;charset=utf-8") {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function IntegrationKitScreen({ accessMode, profile }) {
  const { activeContent, activeFile, checklist, files, requiredChecks, setActiveFile, sourceMode, state } = useIntegrationKitData();

  return <InternoLayout profile={profile} title="Integration Kit" description="Kit de implantacao para replicar a base do produto com mais velocidade e consistencia.">
    <div className="space-y-8">
      <IntegrationKitPanel title="Objetivo">
        <p>Esta area monta um pacote reutilizavel do que ja foi desenvolvido aqui, separando configuracao, mapeamentos e checklist de setup para reaplicar a integracao em qualquer novo repositorio, nova base e nova conta comercial.</p>
        <p>O export nao inclui segredos reais. Ele preserva valores seguros e placeholders para que o proximo projeto faca onboarding sem duplicar estrutura por cliente.</p>
        <p><Link href="/interno/setup-integracao" className="text-[#D4B06A] transition hover:text-[#F0D99B]">Abrir setup inicial</Link></p>
      </IntegrationKitPanel>

      <div className={`border px-5 py-4 text-sm leading-7 ${sourceMode === "admin-runtime" ? "border-[#245440] bg-[rgba(36,84,64,0.18)] text-[#CFEBDC]" : "border-[#6F5830] bg-[rgba(111,88,48,0.18)] text-[#F0DEC0]"}`}>
        <p className="text-[11px] uppercase tracking-[0.22em]">{sourceMode === "admin-runtime" ? "Pacote enriquecido pelo ambiente administrativo" : "Pacote local em modo seguro"}</p>
        <p className="mt-2">{sourceMode === "admin-runtime" ? "O ambiente atual respondeu com o pacote exportavel baseado na configuracao do projeto." : "A pagina continua funcional sem backend e sem sessao admin, usando placeholders seguros e estrutura portatil no navegador."}</p>
        <p className="mt-2">{accessMode === "admin" ? "Sessao administrativa detectada." : "Sem sessao admin: o kit continua disponivel para download e documentacao."}</p>
      </div>

      {state.loading ? <IntegrationKitPanel title="Carregando pacote"><p>Montando o pacote exportavel e validando as variaveis do ambiente atual.</p></IntegrationKitPanel> : null}
      {state.error ? <IntegrationKitPanel title="Falha ao carregar"><p className="text-[#f1b8b8]">{state.error}</p></IntegrationKitPanel> : null}

      {!state.loading && !state.error ? <>
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <IntegrationKitPanel title="Checklist de implantacao">{checklist.map((item) => <p key={item}>- {item}</p>)}</IntegrationKitPanel>
          <IntegrationKitPanel title="Pre-requisitos">{requiredChecks.map((item) => <p key={item.key}><span className={item.present ? "text-emerald-400" : "text-amber-300"}>{item.present ? "OK" : "Pendente"}</span>{" "}{item.label} <span className="text-[#73827D]">({item.key})</span></p>)}</IntegrationKitPanel>
        </div>

        <IntegrationKitPanel title="Arquivos exportaveis">
          <div className="flex flex-wrap gap-2">{Object.keys(files).map((name) => <button key={name} type="button" onClick={() => setActiveFile(name)} className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${activeFile === name ? "border-[#C5A059] bg-[#C5A059] text-[#07110E]" : "border-[#2D2E2E] text-[#C6D1CC] hover:border-[#496159]"}`}>{name}</button>)}</div>
          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" onClick={() => downloadText(activeFile, activeContent, activeFile.endsWith(".json") ? "application/json;charset=utf-8" : "text/plain;charset=utf-8")} className="rounded-full border border-[#2D2E2E] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#F4E7C2] transition hover:border-[#C5A059]">Baixar arquivo atual</button>
            <button type="button" onClick={() => downloadText("integration-bundle.json", JSON.stringify(state.data.bundle, null, 2))} className="rounded-full border border-[#2D2E2E] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#F4E7C2] transition hover:border-[#C5A059]">Baixar pacote completo</button>
          </div>
          <pre className="mt-4 max-h-[560px] overflow-auto border border-[#1E2422] bg-[rgba(6,8,8,0.92)] p-4 text-xs leading-6 text-[#CFD8D4]">{activeContent}</pre>
        </IntegrationKitPanel>

        <IntegrationKitPanel title="Proximos passos recomendados">
          <p>`npm run integration:doctor` para validar variaveis e URLs derivadas.</p>
          <p>`npm run integration:authorize-url` para gerar a URL OAuth da nova conta Freshworks.</p>
          <p>`npm run integration:export-config` para materializar os arquivos em `artifacts/integration-kit`.</p>
          <p>`npm run integration:init` para revisar migrations e sequencia minima de bootstrap.</p>
          <p>Runbook: [setup-integration-kit.md](/D:/Github/newgit/docs/setup-integration-kit.md)</p>
        </IntegrationKitPanel>
      </> : null}
    </div>
  </InternoLayout>;
}
