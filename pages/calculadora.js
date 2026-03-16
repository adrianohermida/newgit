import Head from "next/head";

export default function Calculadora() {
  return (
    <>
      <Head>
        <title>Calculadora de Revisão de Dívidas | Hermida Maia</title>
        <meta name="description" content="Reduza sua dívida em até 70% legalmente. Simule sua revisão de dívidas com base em índices oficiais e jurisprudência atualizada." />
      </Head>
      <div className="layout-container flex flex-col min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100">
        {/* Header / Nav */}
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-primary/10 px-6 md:px-20 py-4 bg-white dark:bg-background-dark">
          <div className="flex items-center gap-4 text-slate-900 dark:text-slate-100">
            <div className="size-8 text-primary">
              <span className="material-symbols-outlined text-4xl">balance</span>
            </div>
            <h2 className="text-xl font-bold leading-tight tracking-[-0.015em]">Hermida Maia</h2>
          </div>
          <div className="hidden md:flex flex-1 justify-end gap-8">
            <nav className="flex items-center gap-9">
              <a className="text-sm font-medium hover:text-primary transition-colors" href="/">Início</a>
              <a className="text-sm font-medium hover:text-primary transition-colors" href="/servicos">Serviços</a>
              <a className="text-sm font-medium hover:text-primary transition-colors" href="/sobre">Sobre</a>
              <a className="text-sm font-medium hover:text-primary transition-colors" href="/contato">Contato</a>
            </nav>
            <button className="flex min-w-[120px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-5 bg-primary text-background-dark text-sm font-bold leading-normal tracking-[0.015em] hover:opacity-90 transition-opacity">
              Falar com Advogado
            </button>
            <Layout>
              <div className="flex-1">
        </header>
        <main className="flex-1">
              </div>
            </Layout>
            <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              {/* Left: Content */}
              <div className="flex flex-col gap-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary w-fit text-xs font-bold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-sm">verified_user</span>
                  Proteção ao Consumidor
                </div>
                <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-[-0.033em]">
                  Reduza sua dívida em até <span className="text-primary">70%</span> legalmente.
                </h1>
                <p className="text-lg opacity-80 leading-relaxed max-w-xl">
                  Nossa calculadora utiliza os índices oficiais para identificar juros abusivos em contratos de financiamento, cartões de crédito e empréstimos pessoais.
                </p>
                <div className="flex flex-col gap-4 mt-4">
                  <div className="flex items-start gap-3">
                    <div className="p-1 bg-primary/20 rounded-full">
                      <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
                    </div>
                    <div>
                      <h4 className="font-bold">Análise Instantânea</h4>
                      <p className="text-sm opacity-70">Saiba o valor real da sua dívida em segundos.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1 bg-primary/20 rounded-full">
                      <span className="material-symbols-outlined text-primary text-xl">shield</span>
                    </div>
                    <div>
                      <h4 className="font-bold">Base Legal Sólida</h4>
                      <p className="text-sm opacity-70">Cálculos baseados em jurisprudência atualizada.</p>
                    </div>
                  </div>
                </div>
                <div className="mt-8 relative rounded-xl overflow-hidden h-64 shadow-2xl">
                  <div className="absolute inset-0 bg-gradient-to-t from-background-dark/80 to-transparent z-10"></div>
                  <img alt="Escritório de advocacia moderno e tecnológico" className="w-full h-full object-cover" src="/images/servicos/escritorio.jpg" />
                  <div className="absolute bottom-4 left-4 z-20">
                    <p className="text-white text-sm font-medium">+15.000 simulações realizadas este mês</p>
                  </div>
                </div>
              </div>
              {/* Right: Calculator Card */}
              <div className="bg-white dark:bg-slate-900 p-8 rounded-xl shadow-2xl border border-primary/10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-primary p-2 rounded-lg text-background-dark">
                    <span className="material-symbols-outlined">calculate</span>
                  </div>
                  <h2 className="text-2xl font-bold">Simule sua Revisão</h2>
                </div>
                <form className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold opacity-80">Tipo de Dívida</label>
                    <select className="form-select w-full rounded-lg border-primary/20 bg-background-light dark:bg-background-dark h-12 focus:ring-primary focus:border-primary">
                      <option>Financiamento de Veículo</option>
                      <option>Cartão de Crédito</option>
                      <option>Empréstimo Pessoal / Consignado</option>
                      <option>Cheque Especial</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold opacity-80">Valor da Parcela (R$)</label>
                      <input className="form-input w-full rounded-lg border-primary/20 bg-background-light dark:bg-background-dark h-12 focus:ring-primary focus:border-primary" placeholder="0,00" type="text" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold opacity-80">Qtd. de Parcelas Totais</label>
                      <input className="form-input w-full rounded-lg border-primary/20 bg-background-light dark:bg-background-dark h-12 focus:ring-primary focus:border-primary" placeholder="Ex: 48" type="number" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold opacity-80">Já pagou quantas?</label>
                    <input className="form-input w-full rounded-lg border-primary/20 bg-background-light dark:bg-background-dark h-12 focus:ring-primary focus:border-primary" placeholder="Ex: 12" type="number" />
                  </div>
                  <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-dashed border-primary/30">
                    <div className="flex items-center gap-2 mb-2 text-primary">
                      <span className="material-symbols-outlined text-sm">lock</span>
                      <span className="text-xs font-bold uppercase">Resultado Seguro</span>
                    </div>
                    <p className="text-xs opacity-70">Para receber o relatório completo com a estimativa de economia, informe seu contato:</p>
                    <input className="form-input w-full mt-3 rounded-lg border-primary/20 bg-white dark:bg-background-dark h-12 focus:ring-primary focus:border-primary" placeholder="Seu melhor e-mail" type="email" />
                  </div>
                  <button className="w-full bg-primary text-background-dark h-14 rounded-lg font-black text-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-lg shadow-primary/20" type="submit">
                    <span className="material-symbols-outlined">rocket_launch</span>
                    CALCULAR ECONOMIA AGORA
                  </button>
                  <p className="text-[10px] text-center opacity-50 uppercase tracking-tighter">Seus dados estão protegidos pela LGPD.</p>
                </form>
              </div>
            </div>
          </section>
          {/* Benefits Section */}
          <section className="bg-primary/5 py-16 px-6 md:px-20 border-y border-primary/10">
            <div className="max-w-[1200px] mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4">Por que fazer a simulação hoje?</h2>
                <div className="w-20 h-1 bg-primary mx-auto rounded-full"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white dark:bg-background-dark p-6 rounded-xl border border-primary/10 hover:border-primary transition-colors group">
                  <span className="material-symbols-outlined text-4xl text-primary mb-4 block group-hover:scale-110 transition-transform">trending_down</span>
                  <h3 className="text-xl font-bold mb-2">Redução de Parcelas</h3>
                  <p className="opacity-70">Identifique juros que podem reduzir sua parcela mensal significativamente.</p>
                </div>
                <div className="bg-white dark:bg-background-dark p-6 rounded-xl border border-primary/10 hover:border-primary transition-colors group">
                  <span className="material-symbols-outlined text-4xl text-primary mb-4 block group-hover:scale-110 transition-transform">money_off</span>
                  <h3 className="text-xl font-bold mb-2">Eliminação de Taxas</h3>
                  <p className="opacity-70">Muitas taxas embutidas são ilegais e podem ser removidas do seu contrato.</p>
                </div>
                <div className="bg-white dark:bg-background-dark p-6 rounded-xl border border-primary/10 hover:border-primary transition-colors group">
                  <span className="material-symbols-outlined text-4xl text-primary mb-4 block group-hover:scale-110 transition-transform">history</span>
                  <h3 className="text-xl font-bold mb-2">Pausa na Cobrança</h3>
                  <p className="opacity-70">Aprenda como agir para evitar buscas e apreensões enquanto revisa.</p>
                </div>
              </div>
            </div>
          </section>
          {/* FAQ Simple */}
          <section className="py-16 px-6 md:px-20 max-w-[800px] mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">Dúvidas Frequentes</h2>
            <div className="space-y-4">
              <details className="group bg-white dark:bg-slate-900 rounded-lg border border-primary/10 overflow-hidden" open>
                <summary className="p-4 cursor-pointer font-bold flex justify-between items-center list-none">
                  É legal fazer a revisão de juros?
                  <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                </summary>
                <div className="p-4 pt-0 opacity-70 border-t border-primary/5">
                  Sim, é um direito constitucional do consumidor revisar contratos que apresentem desequilíbrio ou abusividade financeira.
                </div>
              </details>
              <details className="group bg-white dark:bg-slate-900 rounded-lg border border-primary/10 overflow-hidden">
                <summary className="p-4 cursor-pointer font-bold flex justify-between items-center list-none">
                  Corro risco de perder meu veículo?
                  <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                </summary>
                <div className="p-4 pt-0 opacity-70 border-t border-primary/5">
                  A estratégia jurídica correta visa justamente proteger seu bem. Nossa equipe analisa os riscos específicos de cada caso antes de iniciar.
                </div>
              </details>
              <details className="group bg-white dark:bg-slate-900 rounded-lg border border-primary/10 overflow-hidden">
                <summary className="p-4 cursor-pointer font-bold flex justify-between items-center list-none">
                  Quanto tempo demora o processo?
                  <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                </summary>
                <div className="p-4 pt-0 opacity-70 border-t border-primary/5">
                  O tempo varia conforme o tribunal, mas os efeitos de economia na parcela podem ser sentidos logo nas primeiras fases do processo.
                </div>
              </details>
            </div>
          </section>
        </main>
        <footer className="bg-background-dark text-slate-100 py-12 px-6 md:px-20">
          <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
            <div className="max-w-sm">
              <div className="flex items-center gap-3 mb-6 text-primary">
                <span className="material-symbols-outlined text-3xl">balance</span>
                <h2 className="text-xl font-bold text-white">Hermida Maia</h2>
              </div>
              <p className="opacity-60 text-sm leading-relaxed">
                Especialistas em Direito Bancário e Proteção ao Consumidor. Atuamos em todo o território nacional ajudando pessoas a recuperarem sua saúde financeira.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-2 gap-12">
              <div>
                <h4 className="font-bold mb-4 text-primary">Navegação</h4>
                <ul className="space-y-2 text-sm opacity-70">
                  <li><a className="hover:text-primary" href="/">Início</a></li>
                  <li><a className="hover:text-primary" href="/calculadora">Calculadora</a></li>
                  <li><a className="hover:text-primary" href="/blog">Blog Financeiro</a></li>
                  <li><a className="hover:text-primary" href="/sobre">Quem Somos</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold mb-4 text-primary">Contato</h4>
                <ul className="space-y-2 text-sm opacity-70">
                  <li className="flex items-center gap-2"><span className="material-symbols-outlined text-xs">mail</span> contato@hermidamaia.adv.br</li>
                  <li className="flex items-center gap-2"><span className="material-symbols-outlined text-xs">phone</span> 0800 000 0000</li>
                  <li className="flex items-center gap-2"><span className="material-symbols-outlined text-xs">location_on</span> São Paulo, SP</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="max-w-[1200px] mx-auto mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between gap-4 text-[10px] opacity-40 uppercase tracking-widest">
            <p>© 2024 Hermida Maia Sociedade de Advogados - Todos os direitos reservados.</p>
            <div className="flex gap-4">
              <a href="#">Privacidade</a>
              <a href="#">Termos de Uso</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
