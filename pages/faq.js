import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, MessageSquare, Phone, Send } from "lucide-react";
import Layout from "../components/Layout";
import Head from "next/head";
import { useInternalTheme } from "../components/interno/InternalThemeProvider";

const DARK = "#050706";

const FAQS = [
  {
    category: "geral",
    q: "O que Ã© a Lei do Superendividamento?",
    a: "A Lei do Superendividamento (Lei 14.181/2021) Ã© um instrumento jurÃ­dico que permite aos consumidores que nÃ£o conseguem pagar suas dÃ­vidas sem comprometer o mÃ­nimo para sua sobrevivÃªncia, renegociarem todos os seus dÃ©bitos de forma conjunta e organizada, garantindo a dignidade da pessoa humana.",
  },
  {
    category: "bancario",
    q: "Como identificar se os juros do meu contrato sÃ£o abusivos?",
    a: "Juros abusivos sÃ£o identificados quando a taxa cobrada pelo banco Ã© significativamente superior Ã  taxa mÃ©dia de mercado divulgada pelo Banco Central para a mesma modalidade de crÃ©dito na Ã©poca da contrataÃ§Ã£o. Realizamos uma perÃ­cia tÃ©cnica detalhada para comprovar essas irregularidades.",
  },
  {
    category: "superendividamento",
    q: "Posso limpar meu nome antes de pagar toda a dÃ­vida?",
    a: "Em muitos casos, ao iniciar uma aÃ§Ã£o revisional ou um processo de repactuaÃ§Ã£o de dÃ­vidas baseado no superendividamento, Ã© possÃ­vel solicitar uma liminar para suspender os efeitos da inadimplÃªncia e retirar as restriÃ§Ãµes nos Ã³rgÃ£os de proteÃ§Ã£o ao crÃ©dito (SPC/SERASA).",
  },
  {
    category: "recuperacao",
    q: "O que Ã© a RecuperaÃ§Ã£o Judicial para Produtores Rurais?",
    a: "Ã‰ um benefÃ­cio legal que permite ao produtor rural reestruturar suas dÃ­vidas, suspender execuÃ§Ãµes e manter sua produÃ§Ã£o ativa durante momentos de crise financeira, permitindo o pagamento dos credores em prazos e condiÃ§Ãµes compatÃ­veis com a realidade do campo.",
  },
  {
    category: "bancario",
    q: "Quanto tempo demora um processo de revisÃ£o de juros?",
    a: "O tempo mÃ©dio de um processo judicial de revisÃ£o de juros varia entre 12 a 24 meses. No entanto, em muitos casos, conseguimos obter liminares favorÃ¡veis logo no inÃ­cio do processo e propostas de acordo por parte das instituiÃ§Ãµes financeiras que podem acelerar a resoluÃ§Ã£o.",
  },
  {
    category: "bancario",
    q: "O banco pode tomar meu veÃ­culo durante o processo?",
    a: "Nossa estratÃ©gia jurÃ­dica visa justamente impedir a busca e apreensÃ£o. AtravÃ©s do depÃ³sito do valor que entendemos como justo e da demonstraÃ§Ã£o de abusividade contratual, solicitamos liminares para manter a posse do bem com o consumidor enquanto o mÃ©rito Ã© discutido.",
  },
  {
    category: "geral",
    q: "Quais documentos sÃ£o necessÃ¡rios para iniciar o atendimento?",
    a: "Para uma anÃ¡lise preliminar, geralmente precisamos da cÃ³pia do contrato bancÃ¡rio (ou extratos), documentos pessoais (RG/CPF), comprovante de residÃªncia e, se possÃ­vel, os Ãºltimos comprovantes de pagamento das parcelas.",
  },
  {
    category: "geral",
    q: "Atendem clientes de outros estados alÃ©m de SÃ£o Paulo?",
    a: "Sim. GraÃ§as ao processo judicial 100% digital e Ã s ferramentas de atendimento online, prestamos assessoria jurÃ­dica para consumidores e produtores rurais em todo o territÃ³rio nacional, mantendo o mesmo padrÃ£o de excelÃªncia e proximidade.",
  },
];

const CATEGORIES = [
  { id: "all", label: "Geral" },
  { id: "bancario", label: "Direito BancÃ¡rio" },
  { id: "superendividamento", label: "Superendividamento" },
  { id: "recuperacao", label: "RecuperaÃ§Ã£o Judicial" },
];

function FAQItem({ item, defaultOpen, isLightTheme }) {
  const [open, setOpen] = useState(defaultOpen || false);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: isLightTheme ? "#FFFFFF" : "#181a1b", borderColor: open ? "#C5A059" : (isLightTheme ? "#D4DEE8" : "#232323") }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-6 text-left"
      >
        <h3 className="font-bold text-lg pr-4" style={{ color: isLightTheme ? "#13201D" : "#F4F1EA" }}>{item.q}</h3>
        <ChevronDown
          size={22}
          style={{ color: open ? "#C5A059" : (isLightTheme ? "#13201D" : "#F4F1EA"), flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }}
        />
      </button>
      <div style={{ background: isLightTheme ? "#F7FAFC" : "#232323", color: isLightTheme ? "#13201D" : "#F4F1EA" }}>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ overflow: "hidden" }}
            >
              <div className="px-6 pb-6 leading-relaxed border-t" style={{ color: isLightTheme ? "#4F5F5B" : "#C5A059", borderColor: isLightTheme ? "#D4DEE8" : "#2D2E2E" }}>
                <div className="pt-4">{item.a}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function FAQ() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const { isLightTheme } = useInternalTheme();

  const filtered = FAQS.filter((f) => {
    const matchCat = activeCategory === "all" || f.category === activeCategory;
    const matchSearch = search === "" || f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <Layout>
      <Head>
        <title>DÃºvidas Frequentes: Superendividamento, Juros Abusivos, Contratos e Direito BancÃ¡rio | Hermida Maia</title>
        <meta name="description" content="Perguntas e respostas sobre superendividamento, revisÃ£o bancÃ¡ria, contratos, emprÃ©stimo consignado, cartÃ£o de crÃ©dito, defesa do consumidor e direito bancÃ¡rio." />
        <meta name="keywords" content="advogado, faq, dÃºvidas frequentes, superendividamento, revisÃ£o bancÃ¡ria, contratos, juros abusivo, emprÃ©stimo consignado, cartÃ£o de crÃ©dito, defesa do consumidor, direito bancÃ¡rio" />
      </Head>

      <div style={{ background: isLightTheme ? "#F3F6FA" : "#181a1b", color: isLightTheme ? "#13201D" : "#F4F1EA" }}>
        <section className="relative py-20 overflow-hidden" style={{ background: isLightTheme ? "#EEF2F6" : DARK }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(197,160,89,0.10) 0%, transparent 60%)" }} />
          <div className="relative max-w-4xl mx-auto px-4 text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-4xl md:text-6xl font-black mb-6"
              style={{ color: isLightTheme ? "#13201D" : "#F4F1EA" }}
            >
              Perguntas Frequentes
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-[#C5A059] text-lg md:text-xl leading-relaxed"
            >
              EsclareÃ§a suas dÃºvidas sobre seus direitos e encontre as melhores soluÃ§Ãµes jurÃ­dicas para recuperar sua saÃºde financeira e tranquilidade.
            </motion.p>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 -mt-8 relative z-10">
          <div className="rounded-xl shadow-2xl p-6 border" style={{ background: isLightTheme ? "#FFFFFF" : "#232323", borderColor: isLightTheme ? "#D4DEE8" : "#2D2E2E" }}>
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#C5A059" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-lg outline-none"
                style={{ background: isLightTheme ? "#F7FAFC" : "#181a1b", color: isLightTheme ? "#13201D" : "#F4F1EA" }}
                placeholder="Busque por um tema (ex: Superendividamento, Juros Abusivos...)"
              />
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className="px-5 py-2 rounded-full font-bold text-sm transition-all"
                  style={
                    activeCategory === cat.id
                      ? { background: "#C5A059", color: DARK }
                      : { background: isLightTheme ? "#FFFFFF" : "#232323", color: isLightTheme ? "#13201D" : "#F4F1EA", border: `1px solid ${isLightTheme ? "#D4DEE8" : "#2D2E2E"}` }
                  }
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 py-20">
          <div className="space-y-4">
            {filtered.length === 0 ? (
              <p className="text-center py-12" style={{ color: "#94a3b8" }}>Nenhum resultado encontrado.</p>
            ) : (
              filtered.map((item, i) => (
                <FAQItem key={i} item={item} defaultOpen={i === 0} isLightTheme={isLightTheme} />
              ))
            )}
          </div>
        </section>

        <section className="py-20" style={{ background: isLightTheme ? "#E7EDF4" : DARK }}>
          <div className="max-w-4xl mx-auto px-4 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-8" style={{ background: "rgba(197,160,89,0.10)" }}>
              <MessageSquare size={28} style={{ color: "#C5A059" }} />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-6" style={{ color: isLightTheme ? "#13201D" : "#F4F1EA" }}>Ainda tem dÃºvidas?</h2>
            <p className="text-lg mb-10" style={{ color: "#C5A059" }}>
              Cada caso Ã© Ãºnico. Nossos especialistas estÃ£o prontos para analisar sua situaÃ§Ã£o especÃ­fica e oferecer o melhor caminho jurÃ­dico.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://wa.me/555131810323"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-8 py-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                style={{ background: "#C5A059", color: DARK }}
              >
                <Send size={18} />
                Enviar Mensagem
              </a>
              <a
                href="tel:+5551810323"
                className="w-full sm:w-auto px-8 py-4 rounded-lg font-bold flex items-center justify-center gap-2 border transition-all hover:bg-[#C5A059]/10"
                style={{ borderColor: "#C5A059", color: "#C5A059" }}
              >
                <Phone size={18} />
                Falar via WhatsApp
              </a>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
