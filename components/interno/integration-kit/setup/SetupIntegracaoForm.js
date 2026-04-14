import Link from "next/link";
import { fieldGroups } from "./setupConfig";

export default function SetupIntegracaoForm(props) {
  const { canServerSaveSetup, error, form, handleDownloadSetupFile, handleGenerate, handleSaveLocal, notice, saving, setForm, setValueAtPath, submitting } = props;

  return <form onSubmit={handleGenerate} className="border-r border-[#233630] bg-[rgba(5,8,7,0.92)] px-6 py-8 md:px-10">
    <div className="space-y-8">
      {fieldGroups.map((group, groupIndex) => <section key={group.title} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D4B06A]/50 text-sm text-[#F4E7C2]">{groupIndex + 1}</div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#7D918B]">{group.accent}</p>
            <h2 className="mt-1 text-2xl font-serif text-[#F7F1E8]">{group.title}</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {group.fields.map((field) => <label key={field.key} className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[#B7C3BE]">{field.label}</span>
            <input
              type={field.secret ? "password" : "text"}
              value={field.key.split(".").reduce((acc, key) => acc?.[key], form) || ""}
              onChange={(event) => setForm((current) => setValueAtPath(current, field.key, event.target.value))}
              placeholder={field.placeholder}
              className="w-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#F5F0E7] outline-none transition placeholder:text-white/20 focus:border-[#D4B06A]"
            />
          </label>)}
        </div>
      </section>)}

      {error ? <div className="border border-[#8A3434] bg-[rgba(138,52,52,0.18)] px-4 py-3 text-sm text-[#F6C7C7]">{error}</div> : null}
      {notice ? <div className="border border-[#245440] bg-[rgba(36,84,64,0.2)] px-4 py-3 text-sm text-[#CFEBDC]">{notice}</div> : null}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={submitting} className="bg-[linear-gradient(90deg,#D4B06A,#9E7A2E)] px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#07110E] transition hover:brightness-110 disabled:opacity-60">
          {submitting ? "Gerando..." : "Gerar pacote de setup"}
        </button>
        <button type="button" onClick={handleDownloadSetupFile} className="border border-[#D4B06A]/55 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#F4E7C2] transition hover:border-[#D4B06A]">Baixar setup.secrets.json</button>
        <button type="button" onClick={handleSaveLocal} disabled={saving || !canServerSaveSetup} className="border border-[#D4B06A]/55 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#F4E7C2] transition hover:border-[#D4B06A] disabled:opacity-60">
          {saving ? "Salvando..." : "Salvar no repo local"}
        </button>
        <Link href="/interno/integration-kit" className="text-sm text-[#D4B06A] transition hover:text-[#F0D99B]">Voltar para o export do kit</Link>
      </div>
    </div>
  </form>;
}
