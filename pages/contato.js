import Layout from "../components/Layout";
import Head from "next/head";

export default function Contato() {
  return (
    <Layout>
      <Head>
        <title>Contato | Advogado Especialista em Direito Bancário, Superendividamento e Juros Abusivos | Hermida Maia</title>
        <meta name="description" content="Fale com um advogado especialista em superendividamento, revisão bancária, contratos, defesa contra juros abusivos, empréstimo consignado e direito bancário. Atendimento nacional." />
        <meta name="keywords" content="advogado, contato, superendividamento, revisão bancária, contratos, juros abusivo, empréstimo consignado, cartão de crédito, defesa do consumidor, direito bancário" />
      </Head>
      {/* Grid */}
      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:px-12">
        {/* Formulário */}
        <div className="rounded-2xl bg-[#181a1b] p-8 shadow-xl shadow-[#C5A059]/5 border border-[#2D2E2E]" id="form">
          <h2 className="mb-6 text-2xl font-bold text-[#F4F1EA]">Envie uma Mensagem</h2>
          <form className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#C5A059]">Nome Completo</label>
                <input className="rounded-lg border-[#2D2E2E] bg-[#232323] p-3 text-[#F4F1EA] focus:border-[#C5A059] focus:ring-[#C5A059]" placeholder="Seu nome" type="text" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#C5A059]">E-mail Corporativo</label>
                <input className="rounded-lg border-[#2D2E2E] bg-[#232323] p-3 text-[#F4F1EA] focus:border-[#C5A059] focus:ring-[#C5A059]" placeholder="exemplo@email.com" type="email" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#C5A059]">Telefone (WhatsApp)</label>
                <input className="rounded-lg border-[#2D2E2E] bg-[#232323] p-3 text-[#F4F1EA] focus:border-[#C5A059] focus:ring-[#C5A059]" placeholder="(00) 00000-0000" type="tel" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#C5A059]">Assunto</label>
                <select className="rounded-lg border-[#2D2E2E] bg-[#232323] p-3 text-[#F4F1EA] focus:border-[#C5A059] focus:ring-[#C5A059]">
                  <option>Revisão de Dívidas</option>
                  <option>Recuperação Judicial</option>
                  <option>LGPD</option>
                  <option>Outros Assuntos</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#C5A059]">Sua Mensagem</label>
              <textarea className="rounded-lg border-[#2D2E2E] bg-[#232323] p-3 text-[#F4F1EA] focus:border-[#C5A059] focus:ring-[#C5A059]" placeholder="Como podemos ajudar?" rows={4}></textarea>
            </div>
            <button className="w-full rounded-lg bg-[#C5A059] py-4 font-bold text-[#050706] transition-transform hover:scale-[1.02]" type="submit">
              Enviar Mensagem com Segurança
            </button>
          </form>
        </div>
        {/* Contato Direto */}
        <div className="flex flex-col justify-center space-y-10">
          <div>
            <h3 className="text-3xl font-bold tracking-tight text-[#F4F1EA]">Canais de Atendimento</h3>
            <p className="mt-4 text-[#C5A059]">Prefere um contato direto? Utilize nossos canais oficiais ou visite nossa sede.</p>
          </div>
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#C5A059]/20 text-[#C5A059]">
                <span className="material-symbols-outlined">location_on</span>
              </div>
              <div>
                <p className="font-bold text-[#F4F1EA]">Endereço</p>
                <p className="text-[#C5A059]">Av. Paulista, 1000 - 15º Andar<br/>Bela Vista, São Paulo - SP, 01310-100</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#C5A059]/20 text-[#C5A059]">
                <span className="material-symbols-outlined">call</span>
              </div>
              <div>
                <p className="font-bold text-[#F4F1EA]">Telefone e WhatsApp</p>
                <p className="text-[#C5A059]">+55 (11) 4003-0000</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#C5A059]/20 text-[#C5A059]">
                <span className="material-symbols-outlined">mail</span>
              </div>
              <div>
                <p className="font-bold text-[#F4F1EA]">E-mail</p>
                <p className="text-[#C5A059]">contato@hermidamaia.adv.br</p>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-4 font-bold uppercase tracking-widest text-[#C5A059]">Siga-nos</p>
            <div className="flex gap-4">
              <a className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#232323] transition-colors hover:bg-[#C5A059] dark:bg-[#232323]" href="#">
                <span className="material-symbols-outlined text-xl text-[#C5A059]">share</span>
              </a>
              <a className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#232323] transition-colors hover:bg-[#C5A059] dark:bg-[#232323]" href="#">
                <span className="material-symbols-outlined text-xl text-[#C5A059]">public</span>
              </a>
              <a className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#232323] transition-colors hover:bg-[#C5A059] dark:bg-[#232323]" href="#">
                <span className="material-symbols-outlined text-xl text-[#C5A059]">work</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
