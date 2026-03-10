import React from "react";
import { motion, useInView } from "framer-motion";

const services = [
  {
    title: "Redução de Juros",
    desc: "Contestamos taxas abusivas e renegociamos suas dívidas para reduzir o valor total.",
    icon: (
      <svg width="32" height="32" fill="none" stroke="#C5A059" strokeWidth="2"><circle cx="16" cy="16" r="14" /><path d="M10 16h12M16 10v12" /></svg>
    ),
  },
  {
    title: "Defesa Jurídica",
    desc: "Utilizamos a Lei do Superendividamento para proteger seus direitos e garantir condições justas.",
    icon: (
      <svg width="32" height="32" fill="none" stroke="#C5A059" strokeWidth="2"><rect x="6" y="10" width="20" height="12" rx="2" /><path d="M16 14v4" /></svg>
    ),
  },
  {
    title: "Acompanhamento Especializado",
    desc: "Equipe de advogados e especialistas acompanha todo o processo até a solução.",
    icon: (
      <svg width="32" height="32" fill="none" stroke="#C5A059" strokeWidth="2"><circle cx="16" cy="12" r="6" /><path d="M4 28c0-4 8-6 12-6s12 2 12 6" /></svg>
    ),
  },
];

export default function ServicesSection() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="py-24 lg:py-32 bg-[#0D0F0E]">
      <div className="max-w-6xl mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="font-serif text-4xl md:text-5xl font-light mb-14 text-center"
        >
          Como podemos ajudar você
        </motion.h2>
        <div className="grid md:grid-cols-3 gap-10">
          {services.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1 * i }}
              className="bg-[#181A19] p-8 rounded-lg border border-[#2D2E2E] flex flex-col items-center text-center"
            >
              <div className="mb-6">{s.icon}</div>
              <h3 className="font-serif text-xl mb-2" style={{ color: "#C5A059" }}>{s.title}</h3>
              <p className="opacity-60 text-sm">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
