import Layout from "../components/Layout";
import Head from "next/head";

export default function Contato() {
  return (
    <Layout>
      <Head>
        <title>Contato | Hermida Maia Advocacia</title>
        <meta name="description" content="Fale conosco para consultoria jurídica especializada. Atendimento nacional, excelência e discrição." />
      </Head>
      {/* Hero Section */}
      <section className="relative h-[400px] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#050706]/90 to-[#050706]/40 z-10" />
        <img
          alt="Escritório de advocacia elegante e moderno"
          className="h-full w-full object-cover"
          src="/perfil_2.jpg"
        />
        <div className="relative z-20 flex h-full flex-col items-center justify-center px-6 text-center">
          <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">Fale Conosco</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-200">
            Estamos à disposição para oferecer consultoria jurídica especializada e soluções estratégicas para o seu caso. Excelência e discrição em cada atendimento.
          </p>
          <div className="mt-8 flex gap-4">
            <a className="rounded-lg bg-[#C5A059] px-8 py-3 font-bold text-[#050706] hover:bg-[#C5A059]/90 transition-all" href="#form">Iniciar Contato</a>
            <a className="rounded-lg border border-white/30 bg-white/10 px-8 py-3 font-bold text-white backdrop-blur-sm hover:bg-[#C5A059]/10 transition-all" href="#map">Ver Endereço</a>
          </div>
        </div>
      </section>
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
      {/* Mapa */}
      <section className="w-full h-[450px] bg-[#232323] relative" id="map">
        <div className="absolute inset-0 grayscale opacity-60">
          <img
            alt="Mapa de localização em São Paulo"
            className="w-full h-full object-cover"
            src="/mapa_sp.jpg"
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-[#181a1b] p-6 rounded-xl shadow-2xl flex flex-col items-center gap-2 border border-[#C5A059]/20 z-20">
            <span className="material-symbols-outlined text-[#C5A059] text-4xl">location_on</span>
            <p className="font-bold text-center text-[#F4F1EA]">Nossa Sede</p>
            <p className="text-xs text-[#C5A059]">Estamos aqui para recebê-lo.</p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
