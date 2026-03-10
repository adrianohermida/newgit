import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const GREEN = "#11d473";

const FAQS = [
  {
    question: "Como saber se estou pagando juros abusivos?",
    answer:
      "Realizamos um cálculo pericial comparando as taxas do seu contrato com a taxa média de mercado divulgada pelo Banco Central para o mesmo período e modalidade. Se as taxas do seu contrato estiverem acima da média, podem ser contestadas judicialmente.",
  },
  {
    question: "O que acontece se eu entrar com a Lei do Superendividamento?",
    answer:
      "A justiça convocará todos os seus credores para uma audiência de conciliação, onde será proposto um plano de pagamento que garanta sua subsistência básica. O objetivo é proteger o mínimo existencial enquanto reorganiza suas dívidas.",
  },
  {
    question: "Quais empresas podem pedir Recuperação Judicial?",
    answer:
      "A maioria das empresas privadas em funcionamento há mais de dois anos, incluindo EIRELI e sociedades limitadas, pode solicitar o benefício legal. É necessário comprovar a viabilidade econômica da empresa e apresentar documentação completa.",
  },
];

export default function ServicosFAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="py-20 lg:py-32" style={{ background: "rgba(17,212,115,0.04)" }}>
      <div className="mx-auto max-w-3xl px-6 lg:px-12">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold tracking-tight lg:text-4xl" style={{ color: "#0f172a" }}>
            Dúvidas Frequentes
          </h2>
          <p className="mt-4" style={{ color: "#475569" }}>
            Esclareça as principais questões sobre nossos serviços especializados.
          </p>
        </div>

        <div className="space-y-4">
          {FAQS.map((faq, i) => (
            <div
              key={faq.question}
              className="rounded-lg border bg-white overflow-hidden"
              style={{ borderColor: "rgba(17,212,115,0.15)" }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
                className="flex w-full items-center justify-between text-left px-6 py-5 font-bold transition-colors hover:bg-gray-50"
                style={{ color: "#0f172a" }}
              >
                <span>{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === i ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ flexShrink: 0, marginLeft: 12 }}
                >
                  <ChevronDown size={20} style={{ color: GREEN }} />
                </motion.div>
              </button>

              <AnimatePresence initial={false}>
                {openIndex === i && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <p className="px-6 pb-5 text-sm leading-relaxed" style={{ color: "#475569" }}>
                      {faq.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
