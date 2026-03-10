
import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";

const SERVICES = [
  {
    title: "Defesa contra Juros Abusivos",
    desc: "Identificamos cláusulas ilegais em contratos bancários e reduzimos o valor real da sua dívida.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/eb41f4fb8_generated_image.png",
    number: "01",
  },
  {
    title: "Lei do Superendividamento",
    desc: "Aplicação da Lei 14.181/21 para garantir o mínimo existencial e repactuação global de débitos.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/92604e21e_generated_image.png",
    number: "02",
  },
  {
    title: "Recuperação Judicial",
    desc: "Suporte estratégico para empresas em crise financeira reestruturarem suas obrigações.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/785905e76_generated_image.png",
    number: "03",
  },
];

function ServiceCard({ service, index }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay: index * 0.15 }}
      className="group relative light-sweep cursor-pointer"
      style={{ background: "#0D0F0E", border: "1px solid #2D2E2E" }}
    >
      {/* Image */}
      <div className="aspect-[16/10] overflow-hidden">
        <img
          src={service.image}
          alt={service.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ filter: "brightness(0.6) contrast(1.1)" }}
        />
        <div 
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(5, 7, 6, 0.95) 30%, transparent 70%)" }}
        />
      </div>

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-8">
        <div className="flex items-start justify-between mb-4">
          <span 
            className="text-xs font-semibold tracking-[0.2em] opacity-40"
            style={{ color: "#C5A059" }}
          >
            {service.number}
          </span>
        </div>
        <h4 className="font-serif text-2xl md:text-3xl font-light mb-3" style={{ color: "#F4F1EA" }}>
          {service.title}
        </h4>
        <p className="text-sm leading-relaxed opacity-50 mb-6 max-w-md">
          {service.desc}
        </p>
        <div 
          className="inline-flex items-center gap-3 text-xs font-semibold tracking-[0.15em] uppercase group-hover:gap-5 transition-all duration-300"
          style={{ color: "#C5A059" }}
        >
          Saiba mais
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}

export default function ServicesSection() {
  const headerRef = useRef(null);
  const isInView = useInView(headerRef, { once: true });

  return (
    <section id="servicos" className="py-24 lg:py-32 relative">
      <div className="mx-auto max-w-7xl px-6">
        <div ref={headerRef} className="mb-16 lg:mb-20">
          <motion.p
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6 }}
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
            style={{ color: "#C5A059" }}
          >
            Soluções Jurídicas
          </motion.p>
          <motion.h3
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="font-serif text-4xl md:text-5xl lg:text-6xl font-light"
          >
            Como podemos te<br className="hidden md:block" /> ajudar <span className="italic" style={{ color: "#C5A059" }}>hoje?</span>
          </motion.h3>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service, i) => (
            <ServiceCard key={service.number} service={service} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
