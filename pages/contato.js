
import React from "react";
import Layout from "../components/Layout";
import Head from "next/head";
import { useInternalTheme } from "../components/interno/InternalThemeProvider";

export default function Contato() {
  const { isLightTheme } = useInternalTheme();
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    subject: 'Revisão de Dívidas',
    message: '',
    website: ''
  });
  const [loading, setLoading] = React.useState(false);
  const [feedback, setFeedback] = React.useState(null);
  const startedAtRef = React.useRef(Date.now());

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name || !form.email) {
      setFeedback('Por favor, preencha nome e e-mail.');
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/freshdesk-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          subject: form.subject,
          description: `${form.message}\nTelefone: ${form.phone}`,
          custom_fields: {},
          website: form.website,
          startedAt: startedAtRef.current
        })
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback('Mensagem enviada com sucesso! Em breve entraremos em contato.');
        startedAtRef.current = Date.now();
        setForm({ name: '', email: '', phone: '', subject: 'Revisão de Dívidas', message: '', website: '' });
      } else {
        setFeedback('Erro ao enviar mensagem: ' + (data.error || 'Tente novamente.'));
      }
    } catch (err) {
      setFeedback('Erro ao enviar mensagem: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <Layout>
      <Head>
        <title>Contato | Advogado Especialista em Direito Bancário, Superendividamento e Juros Abusivos | Hermida Maia</title>
        <meta name="description" content="Fale com um advogado especialista em superendividamento, revisão bancária, contratos, defesa contra juros abusivos, empréstimo consignado e direito bancário. Atendimento nacional." />
        <meta name="keywords" content="advogado, contato, superendividamento, revisão bancária, contratos, juros abusivo, empréstimo consignado, cartão de crédito, defesa do consumidor, direito bancário" />
      </Head>
      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:px-12 mt-24">
        <div className={`rounded-2xl p-8 shadow-xl shadow-[#C5A059]/5 border ${isLightTheme ? "bg-[#FFFFFF] border-[#D4DEE8]" : "bg-[#181a1b] border-[#2D2E2E]"}`} id="form">
          <h2 className={`mb-6 text-2xl font-bold ${isLightTheme ? "text-[#13201D]" : "text-[#F4F1EA]"}`}>Envie uma Mensagem</h2>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#C5A059]">Nome Completo</label>
                <input name="name" value={form.name} onChange={handleChange} className={`rounded-lg p-3 focus:border-[#C5A059] focus:ring-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC] text-[#13201D]" : "border-[#2D2E2E] bg-[#232323] text-[#F4F1EA]"}`} placeholder="Seu nome" type="text" required />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#C5A059]">E-mail Corporativo</label>
                <input name="email" value={form.email} onChange={handleChange} className={`rounded-lg p-3 focus:border-[#C5A059] focus:ring-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC] text-[#13201D]" : "border-[#2D2E2E] bg-[#232323] text-[#F4F1EA]"}`} placeholder="exemplo@email.com" type="email" required />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#C5A059]">Telefone (WhatsApp)</label>
                <input name="phone" value={form.phone} onChange={handleChange} className={`rounded-lg p-3 focus:border-[#C5A059] focus:ring-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC] text-[#13201D]" : "border-[#2D2E2E] bg-[#232323] text-[#F4F1EA]"}`} placeholder="(00) 00000-0000" type="tel" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#C5A059]">Assunto</label>
                <select name="subject" value={form.subject} onChange={handleChange} className={`rounded-lg p-3 focus:border-[#C5A059] focus:ring-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC] text-[#13201D]" : "border-[#2D2E2E] bg-[#232323] text-[#F4F1EA]"}`}>
                  <option>RevisÃ£o de DÃ­vidas</option>
                  <option>RecuperaÃ§Ã£o Judicial</option>
                  <option>LGPD</option>
                  <option>Outros Assuntos</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#C5A059]">Sua Mensagem</label>
              <textarea name="message" value={form.message} onChange={handleChange} className={`rounded-lg p-3 focus:border-[#C5A059] focus:ring-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC] text-[#13201D]" : "border-[#2D2E2E] bg-[#232323] text-[#F4F1EA]"}`} placeholder="Como podemos ajudar?" rows={4} required></textarea>
            </div>
            <div className="hidden" aria-hidden="true">
              <label>Website</label>
              <input name="website" value={form.website} onChange={handleChange} tabIndex={-1} autoComplete="off" />
            </div>
            <button className="w-full rounded-lg bg-[#C5A059] py-4 font-bold text-[#050706] transition-transform hover:scale-[1.02]" type="submit" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar Mensagem com Segurança'}
            </button>
            {feedback && <div className="mt-4 text-center text-[#C5A059]">{feedback}</div>}
          </form>
        </div>
        <div className="flex flex-col justify-center space-y-10">
          <div>
            <h3 className={`text-3xl font-bold tracking-tight ${isLightTheme ? "text-[#13201D]" : "text-[#F4F1EA]"}`}>Canais de Atendimento</h3>
            <p className="mt-4 text-[#C5A059]">Prefere um contato direto? Utilize nossos canais oficiais ou visite nossa sede.</p>
          </div>
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#C5A059]/20 text-[#C5A059]">
                <span className="material-symbols-outlined">location_on</span>
              </div>
              <div>
                <p className={`font-bold ${isLightTheme ? "text-[#13201D]" : "text-[#F4F1EA]"}}`}>Endereço</p>                <p className="text-[#C5A059]">Av. Dolores Alcaraz Caldas, 90, 8º Andar – Praia de Belas, CEP 90110-180 - Porto Alegre/ RS</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#C5A059]/20 text-[#C5A059]">
                <span className="material-symbols-outlined">call</span>
              </div>
              <div>
                <p className={`font-bold ${isLightTheme ? "text-[#13201D]" : "text-[#F4F1EA]"}`}>Telefone e WhatsApp</p>
                <p className="text-[#C5A059]">+55 (51) 3181-0323</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#C5A059]/20 text-[#C5A059]">
                <span className="material-symbols-outlined">mail</span>
              </div>
              <div>
                <p className={`font-bold ${isLightTheme ? "text-[#13201D]" : "text-[#F4F1EA]"}`}>E-mail</p>
                <p className="text-[#C5A059]">contato@hermidamaia.adv.br</p>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-4 font-bold uppercase tracking-widest text-[#C5A059]">Siga-nos</p>
            <div className="flex gap-4">
              <a className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-[#C5A059] ${isLightTheme ? "bg-[#FFFFFF] border border-[#D4DEE8]" : "bg-[#232323]"}`} href="#">
                <span className="material-symbols-outlined text-xl text-[#C5A059]">share</span>
              </a>
              <a className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-[#C5A059] ${isLightTheme ? "bg-[#FFFFFF] border border-[#D4DEE8]" : "bg-[#232323]"}`} href="#">
                <span className="material-symbols-outlined text-xl text-[#C5A059]">public</span>
              </a>
              <a className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-[#C5A059] ${isLightTheme ? "bg-[#FFFFFF] border border-[#D4DEE8]" : "bg-[#232323]"}`} href="#">
                <span className="material-symbols-outlined text-xl text-[#C5A059]">work</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
