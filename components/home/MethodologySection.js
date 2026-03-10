
import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";

const STEPS = [
  {
    number: "01",
    title: "Consultoria",
    desc: "Análise técnica detalhada de todos os seus contratos e débitos.",
  },
  {
    number: "02",
    title: "Estratégia",
    desc: "Desenvolvimento de plano jurídico personalizado para seu caso.",
  },
  {
    number: "03",
    title: "Negociação",
    desc: "Intervenção direta com credores ou via processo judicial célere.",
  },
  {
    number: "04",
    title: "Solução",
    desc: "Assinatura do acordo e restabelecimento do seu crédito.",
  },
];

function StepCard({ step, index }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: index * 0.15 }}
      className="relative group"
    >
      {/* Connector line */}
      {index < STEPS.length - 1 && (
        <div 
          className="hidden lg:block absolute top-10 left-full w-full h-px"
          style={{ background: "linear-gradient(to right, #2D2E2E, transparent)" }}
        />
      )}
      
      <div className="text-center lg:text-left">
        <div className="inline-flex items-center justify-center w-20 h-20 mb-6 relative">
          <div 
            className="absolute inset-0 transition-all duration-500"
            style={{ 
              border: index === 3 ? "1px solid #C5A059" : "1px solid #2D2E2E",
              background: index === 3 ? "rgba(197, 160, 89, 0.05)" : "transparent",
            }}
          />
          <span 
            className="font-serif text-2xl font-light relative z-10"
            style={{ color: index === 3 ? "#C5A059" : "#F4F1EA" }}
          >
            {step.number}
          </span>
        </div>
        
        <h4 className="font-serif text-2xl font-light mb-3" style={{ color: "#F4F1EA" }}>
          {step.title}
        </h4>
        <p className="text-sm leading-relaxed opacity-40 max-w-xs mx-auto lg:mx-0">
          {step.desc}
        </p>
      </div>
    </motion.div>
  );
}

export default function MethodologySection() {
  const headerRef = useRef(null);
  const isInView = useInView(headerRef, { once: true });

  return (
    <section className="py-24 lg:py-32 relative" style={{ borderTop: "1px solid #2D2E2E", background: "#050706", color: "#F4F1EA" }}>
      <div className="mx-auto max-w-7xl px-6">
        <div ref={headerRef} className="text-center mb-20">
          <motion.p
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6 }}
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
            style={{ color: "#C5A059" }}
          >
            METODOLOGIA
          </motion.p>
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="font-serif text-4xl md:text-5xl font-light"
          >
            Seu caminho para a <span className="italic" style={{ color: "#C5A059" }}>liberdade</span> financeira
          </motion.h3>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {STEPS.map((step, i) => (
            <StepCard key={step.number} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
