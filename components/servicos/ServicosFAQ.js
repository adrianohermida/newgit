import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const GOLD = "#C5A059";

const FAQS = [
  {
    question: "Como funciona o processo de identificação de juros abusivos?",
    answer:
      "Nossa equipe realiza uma análise detalhada dos contratos, identificando cláusulas abusivas e taxas acima do permitido. Utilizamos perícia técnica para fundamentar a defesa e buscar a redução dos encargos.",
  },
  {
    question: "A Lei do Superendividamento protege meus bens imediatos?",
    answer:
      "Sim. O plano de repactuação garante que o mínimo existencial seja preservado, protegendo recursos essenciais e evitando a perda de bens necessários à subsistência.",
  },
  {
    question: "Qual a viabilidade de uma Recuperação Judicial para minha holding?",
    answer:
      "A viabilidade depende da análise do passivo, ativos e fluxo de caixa da empresa. Nossa banca avalia cada caso para propor a melhor estratégia de recuperação e proteção patrimonial.",
  },
];

export default function ServicosFAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="py-20 lg:py-32" style={{ background: "#050706" }}>
      <div className="mx-auto max-w-3xl px-6 lg:px-12">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold tracking-tight lg:text-4xl" style={{ color: "#F4F1EA" }}>
            Dúvidas Frequentes
          </h2>
          <p className="mt-4" style={{ color: GOLD }}>
            Esclareça as principais questões sobre nossos serviços especializados.
          </p>
        </div>

        <div className="space-y-4">
          {FAQS.map((faq, i) => (
            <div
              key={faq.question}
              className="rounded-lg border bg-[#232323] overflow-hidden"
              style={{ borderColor: "rgba(197,160,89,0.15)" }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
                className="flex w-full items-center justify-between text-left px-6 py-5 font-bold transition-colors hover:bg-[#2d2d2d]"
                style={{ color: "#F4F1EA" }}
              >
                <span>{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === i ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ flexShrink: 0, marginLeft: 12 }}
                >
                  <ChevronDown size={20} style={{ color: GOLD }} />
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
                    <p className="px-6 pb-5 text-sm leading-relaxed" style={{ color: GOLD }}>
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
