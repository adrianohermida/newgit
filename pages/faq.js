import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, MessageSquare, Phone, Send } from "lucide-react";
import Layout from "../components/Layout";

const GREEN = "#11d473";
const DARK = "#102219";

const FAQS = [
  {
    category: "geral",
    q: "O que é a Lei do Superendividamento?",
    a: "A Lei do Superendividamento (Lei 14.181/2021) é um instrumento jurídico que permite aos consumidores que não conseguem pagar suas dívidas sem comprometer o mínimo para sua sobrevivência, renegociarem todos os seus débitos de forma conjunta e organizada, garantindo a dignidade da pessoa humana.",
  },
  {
    category: "bancario",
    q: "Como identificar se os juros do meu contrato são abusivos?",
    a: "Juros abusivos são identificados quando a taxa cobrada pelo banco é significativamente superior à taxa média de mercado divulgada pelo Banco Central para a mesma modalidade de crédito na época da contratação. Realizamos uma perícia técnica detalhada para comprovar essas irregularidades.",
  },
  {
    category: "superendividamento",
    q: "Posso limpar meu nome antes de pagar toda a dívida?",
    a: "Em muitos casos, ao iniciar uma ação revisional ou um processo de repactuação de dívidas baseado no superendividamento, é possível solicitar uma liminar para suspender os efeitos da inadimplência e retirar as restrições nos órgãos de proteção ao crédito (SPC/SERASA).",
  },
  {
    category: "recuperacao",
    q: "O que é a Recuperação Judicial para Produtores Rurais?",
    a: "É um benefício legal que permite ao produtor rural reestruturar suas dívidas, suspender execuções e manter sua produção ativa durante momentos de crise financeira, permitindo o pagamento dos credores em prazos e condições compatíveis com a realidade do campo.",
  },
  {
    category: "bancario",
    q: "Quanto tempo demora um processo de revisão de juros?",
    a: "O tempo médio de um processo judicial de revisão de juros varia entre 12 a 24 meses. No entanto, em muitos casos, conseguimos obter liminares favoráveis logo no início do processo e propostas de acordo por parte das instituições financeiras que podem acelerar a resolução.",
  },
  {
    category: "bancario",
    q: "O banco pode tomar meu veículo durante o processo?",
    a: "Nossa estratégia jurídica visa justamente impedir a busca e apreensão. Através do depósito do valor que entendemos como justo e da demonstração de abusividade contratual, solicitamos liminares para manter a posse do bem com o consumidor enquanto o mérito é discutido.",
  },
  {
    category: "geral",
    q: "Quais documentos são necessários para iniciar o atendimento?",
    a: "Para uma análise preliminar, geralmente precisamos da cópia do contrato bancário (ou extratos), documentos pessoais (RG/CPF), comprovante de residência e, se possível, os últimos comprovantes de pagamento das parcelas.",
  },
  {
    category: "geral",
    q: "Atendem clientes de outros estados além de São Paulo?",
    a: "Sim. Graças ao processo judicial 100% digital e às ferramentas de atendimento online, prestamos assessoria jurídica para consumidores e produtores rurais em todo o território nacional, mantendo o mesmo padrão de excelência e proximidade.",
  },
];

const CATEGORIES = [
  { id: "all", label: "Geral" },
  { id: "bancario", label: "Direito Bancário" },
  { id: "superendividamento", label: "Superendividamento" },
  { id: "recuperacao", label: "Recuperação Judicial" },
];


function FAQItem({ item, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen || false);
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "#fff", borderColor: open ? "rgba(17,212,115,0.3)" : "#e2e8f0" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-6 text-left"
      >
        <h3 className="font-bold text-lg pr-4" style={{ color: "#0f172a" }}>{item.q}</h3>
        <ChevronDown
          size={22}
          style={{ color: GREEN, flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }}
        />
      </button>
      <div style={{ background: "#f6f8f7", color: "#0f172a" }}>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ overflow: "hidden" }}
            >
              <div className="px-6 pb-6 leading-relaxed border-t" style={{ color: "#475569", borderColor: "#f1f5f9" }}>
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
  const filtered = FAQS.filter((f) => {
    const matchCat = activeCategory === "all" || f.category === activeCategory;
    const matchSearch = search === "" || f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });
  return (
    <Layout>
      <div style={{ background: "#f6f8f7", color: "#0f172a" }}>
        {/* Hero */}
        <section className="relative py-20 overflow-hidden" style={{ background: "#0f172a" }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(17,212,115,0.15) 0%, transparent 60%)" }} />
          <div className="relative max-w-4xl mx-auto px-4 text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-white text-4xl md:text-6xl font-black mb-6"
            >
              Perguntas Frequentes
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-slate-300 text-lg md:text-xl leading-relaxed"
            >
              Esclareça suas dúvidas sobre seus direitos e encontre as melhores soluções jurídicas para recuperar sua saúde financeira e tranquilidade.
            </motion.p>
          </div>
        </section>

        {/* Search & Categories */}
        <section className="max-w-4xl mx-auto px-4 -mt-8 relative z-10">
          <div className="rounded-xl shadow-2xl p-6 border" style={{ background: "#fff", borderColor: "#e2e8f0" }}>
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#94a3b8" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-lg outline-none"
                style={{ background: "#f1f5f9", color: "#0f172a" }}
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
                      ? { background: GREEN, color: DARK }
                      : { background: "#f1f5f9", color: "#475569" }
                  }
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ List */}
        <section className="max-w-4xl mx-auto px-4 py-20">
          <div className="space-y-4">
            {filtered.length === 0 ? (
              <p className="text-center py-12" style={{ color: "#94a3b8" }}>Nenhum resultado encontrado.</p>
            ) : (
              filtered.map((item, i) => (
                <FAQItem key={i} item={item} defaultOpen={i === 0} />
              ))
            )}
          </div>
        </section>

        {/* CTA */}
        <section className="py-20" style={{ background: DARK }}>
          <div className="max-w-4xl mx-auto px-4 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-8" style={{ background: "rgba(17,212,115,0.15)" }}>
              <MessageSquare size={28} style={{ color: GREEN }} />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Ainda tem dúvidas?</h2>
            <p className="text-lg mb-10" style={{ color: "#94a3b8" }}>
              Cada caso é único. Nossos especialistas estão prontos para analisar sua situação específica e oferecer o melhor caminho jurídico.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://wa.me/555131810323"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-8 py-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                style={{ background: GREEN, color: DARK }}
              >
                <Send size={18} />
                Enviar Mensagem
              </a>
              <a
                href="tel:+5551810323"
                className="w-full sm:w-auto px-8 py-4 rounded-lg font-bold flex items-center justify-center gap-2 border transition-all hover:bg-[#11d473]/10"
                style={{ borderColor: GREEN, color: GREEN }}
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
