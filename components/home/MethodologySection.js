import React from "react";
import { motion, useInView } from "framer-motion";

const steps = [
  {
    title: "Envie seus dados",
    desc: "Preencha o simulador com suas informações e tipo de dívida.",
  },
  {
    title: "Receba a análise",
    desc: "Nossa equipe jurídica avalia seu caso e estima a economia possível.",
  },
  {
    title: "Negocie com apoio",
    desc: "Acompanhamos você em todo o processo de negociação e defesa.",
  },
];

export default function MethodologySection() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="py-24 lg:py-32 bg-black">
      <div className="max-w-5xl mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="font-serif text-4xl md:text-5xl font-light mb-14 text-center"
        >
          Como funciona
        </motion.h2>
        <div className="grid md:grid-cols-3 gap-10">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1 * i }}
              className="bg-[#181A19] p-8 rounded-lg border border-[#2D2E2E] flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 flex items-center justify-center rounded-full mb-6" style={{ background: "#C5A05922" }}>
                <span className="font-serif text-2xl" style={{ color: "#C5A059" }}>{i + 1}</span>
              </div>
              <h3 className="font-serif text-lg mb-2" style={{ color: "#C5A059" }}>{s.title}</h3>
              <p className="opacity-60 text-sm">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
