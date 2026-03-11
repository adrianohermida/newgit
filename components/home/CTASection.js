import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";

export default function CTASection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section 
      ref={ref}
      className="py-24 lg:py-32 relative overflow-hidden"
      style={{ 
        background: "linear-gradient(135deg, #1B4332 0%, #050706 100%)",
        borderTop: "1px solid rgba(197, 160, 89, 0.15)",
      }}
    >
      {/* Decorative lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-px h-full opacity-5" style={{ background: "#C5A059" }} />
        <div className="absolute top-0 left-2/4 w-px h-full opacity-5" style={{ background: "#C5A059" }} />
        <div className="absolute top-0 left-3/4 w-px h-full opacity-5" style={{ background: "#C5A059" }} />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          className="text-xs font-semibold tracking-[0.3em] uppercase mb-6"
          style={{ color: "#C5A059" }}
        >
          Comece agora
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1, duration: 0.8 }}
          className="font-serif text-4xl md:text-6xl lg:text-7xl font-light mb-8"
          style={{ color: "#F4F1EA" }}
        >
          Sua <span className="italic text-gold-gradient">liberdade</span> financeira começa com uma conversa
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="text-base opacity-40 mb-12 max-w-2xl mx-auto leading-relaxed"
        >
          Agende uma consulta gratuita e descubra como podemos reduzir suas dívidas e restaurar sua paz financeira.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="flex flex-wrap justify-center gap-4"
        >
          <a
            href="https://wa.me/555131810323"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-10 py-5 text-sm font-semibold tracking-[0.12em] uppercase transition-all duration-300 hover:scale-105"
            style={{ background: "#C5A059", color: "#050706" }}
          >
            Falar com Especialista
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
          <a
            href="tel:+5551810323"
            className="inline-flex items-center gap-3 px-10 py-5 text-sm font-semibold tracking-[0.12em] uppercase border transition-all duration-300 hover:bg-white/5"
            style={{ borderColor: "rgba(244, 241, 234, 0.15)", color: "#F4F1EA" }}
          >
            (51) 3181-0323
          </a>
        </motion.div>
      </div>
    </section>
  );
}
