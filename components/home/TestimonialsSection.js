import React from "react";
import { motion, useInView } from "framer-motion";

const testimonials = [
  {
    name: "Ana Paula S.",
    text: "Consegui reduzir minha dívida em mais de 60%! O atendimento foi excelente e todo o processo foi transparente.",
  },
  {
    name: "Carlos M.",
    text: "Achei que nunca sairia do vermelho, mas com a ajuda deles consegui negociar condições muito melhores.",
  },
  {
    name: "Juliana R.",
    text: "Equipe muito atenciosa, sempre me explicando cada passo. Recomendo para quem está endividado!",
  },
];

export default function TestimonialsSection() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="py-24 lg:py-32 bg-[#0D0F0E]">
      <div className="max-w-5xl mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="font-serif text-4xl md:text-5xl font-light mb-14 text-center"
        >
          Depoimentos de clientes
        </motion.h2>
        <div className="grid md:grid-cols-3 gap-10">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1 * i }}
              className="bg-[#181A19] p-8 rounded-lg border border-[#2D2E2E] flex flex-col items-center text-center"
            >
              <p className="text-base font-serif mb-4" style={{ color: "#C5A059" }}>
                “{t.text}”
              </p>
              <span className="text-xs opacity-60">{t.name}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
