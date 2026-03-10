
import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";

const TESTIMONIALS = [
  {
    quote: "Minha dívida de R$ 80 mil foi reduzida para R$ 12 mil com parcelas que eu realmente podia pagar. O atendimento foi excepcional!",
    name: "Maria Oliveira",
    location: "São Paulo, SP",
    initials: "MO",
  },
  {
    quote: "Profissionais extremamente competentes. Conseguiram suspender a busca e apreensão do meu veículo em 48 horas.",
    name: "Ricardo Santos",
    location: "Curitiba, PR",
    initials: "RS",
  },
];

export default function TestimonialsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-24 lg:py-32 relative" style={{ background: "rgba(27, 67, 50, 0.08)" }}>
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid lg:grid-cols-3 gap-12 lg:gap-16 items-start">
          {/* Stats column */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="lg:col-span-1"
          >
            <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-6" style={{ color: "#C5A059" }}>
              Resultados
            </p>
            <h2 className="font-serif text-6xl md:text-7xl font-light mb-2 text-gold-gradient">
              R$ 35M+
            </h2>
            <h3 className="font-serif text-2xl font-light mb-6" style={{ color: "#F4F1EA" }}>
              Em dívidas renegociadas para nossos clientes
            </h3>
            <p className="text-sm leading-relaxed opacity-40">
              Resultados reais que transformam vidas e salvam patrimônios familiares todos os meses.
            </p>

            <div className="mt-10 pt-10" style={{ borderTop: "1px solid #2D2E2E" }}>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="font-serif text-3xl font-light" style={{ color: "#C5A059" }}>10k+</p>
                  <p className="text-xs opacity-40 mt-1">Clientes atendidos</p>
                </div>
                <div>
                  <p className="font-serif text-3xl font-light" style={{ color: "#C5A059" }}>98%</p>
                  <p className="text-xs opacity-40 mt-1">Taxa de sucesso</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Testimonials */}
          <div className="lg:col-span-2 space-y-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.8, delay: 0.2 + i * 0.15 }}
                className="p-8 md:p-10 relative"
                style={{ background: "rgba(13, 15, 14, 0.6)", border: "1px solid #2D2E2E" }}
              >
                {/* Gold quote mark */}
                <div 
                  className="absolute top-6 right-8 font-serif text-7xl leading-none opacity-10"
                  style={{ color: "#C5A059" }}
                >
                  "
                </div>

                {/* Stars */}
                <div className="flex gap-1 mb-6">
                  {[...Array(5)].map((_, idx) => (
                    <svg key={idx} width="14" height="14" viewBox="0 0 24 24" fill="#C5A059">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ))}
                </div>

                <p className="font-serif text-xl md:text-2xl font-light leading-relaxed mb-8 italic" style={{ color: "#F4F1EA" }}>
                  "{t.quote}"
                </p>

                <div className="flex items-center gap-4">
                  <div 
                    className="w-10 h-10 flex items-center justify-center text-xs font-semibold"
                    style={{ border: "1px solid rgba(197, 160, 89, 0.3)", color: "#C5A059" }}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#F4F1EA" }}>{t.name}</p>
                    <p className="text-xs opacity-40">{t.location}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
