function RailMetric({ label, value, tone = "text-[#F7F1E8]" }) {
  return <div className="border-t border-white/10 pt-3">
    <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">{label}</p>
    <p className={`mt-2 text-lg ${tone}`}>{value}</p>
  </div>;
}

export default function SetupIntegracaoHero({ setupMode }) {
  return <section className="relative border-b border-[#233630] px-6 py-8 md:px-10 md:py-10">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,168,89,0.22),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(30,78,67,0.34),transparent_48%)]" />
    <div className="relative grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.32em] text-[#D4B06A]">Setup Atelier</p>
        <h1 className="mt-4 max-w-2xl font-serif text-4xl leading-tight md:text-5xl">Preencha uma vez. Gere o pacote. Dispare o bootstrap.</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[#B0BDB8]">Esta tela foi desenhada para iniciar um novo projeto com o minimo de atrito: coletamos os secrets principais, geramos o `setup.secrets.json`, o `.env.bootstrap`, a URL OAuth e os arquivos de configuracao que o comando unico consome.</p>
        <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-[#DAD1BF]">
          <span className="border border-white/10 px-3 py-2">1. Credenciais</span>
          <span className="border border-white/10 px-3 py-2">2. Pre-visualizacao</span>
          <span className="border border-white/10 px-3 py-2">3. `npm run integration:bootstrap`</span>
        </div>
      </div>
      <div className="border border-white/10 bg-[rgba(255,255,255,0.03)] p-5 backdrop-blur">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#D4B06A]">Operacao enxuta</p>
        <div className="mt-5 space-y-4">
          <RailMetric label="Destino do setup" value="`setup/integration-kit`" />
          <RailMetric label="Saida gerada" value="`generated/<workspace>`" tone="text-[#BFE5D3]" />
          <RailMetric label="Modo atual" value={setupMode === "local-ops" ? "`local-ops`" : "`static-safe`"} tone="text-[#F4E7C2]" />
        </div>
      </div>
    </div>
  </section>;
}
