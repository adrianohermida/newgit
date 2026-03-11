import React from "react";
import { motion } from "framer-motion";

const GOLD = "#C5A059";

export default function ServicosCTA() {
  return (
    <section
      className="py-24 lg:py-32 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #1B4332 0%, #050706 100%)",
        borderTop: "1px solid rgba(197, 160, 89, 0.15)",
      }}
    >
      {/* Decorative lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-px h-full opacity-5" style={{ background: GOLD }} />
        <div className="absolute top-0 left-2/4 w-px h-full opacity-5" style={{ background: GOLD }} />
        <div className="absolute top-0 left-3/4 w-px h-full opacity-5" style={{ background: GOLD }} />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="text-xs font-semibold tracking-[0.3em] uppercase mb-6"
          style={{ color: GOLD }}
        >
          Comece agora
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.8 }}
          className="text-4xl font-bold text-white lg:text-6xl leading-tight mb-8"
          style={{ color: "#F4F1EA" }}
        >
          Retome a <span className="gold-gradient-text">Soberania</span> das suas Finanças
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="mt-8 text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed"
        >
          Nossa banca está pronta para blindar seu patrimônio e restaurar seu equilíbrio institucional.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="flex flex-wrap justify-center gap-6"
        >
          <a
            href="https://wa.me/555131810323"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-primary px-12 py-5 text-sm font-black uppercase tracking-widest text-background-dark shadow-2xl transition-transform hover:scale-105 active:scale-95"
          >
            Falar com um Sócio
          </a>
          <a
            href="#"
            className="rounded-full border border-white/20 bg-white/5 px-12 py-5 text-sm font-black uppercase tracking-widest text-white backdrop-blur-md transition-colors hover:bg-white/10"
          >
            Conhecer a Banca
          </a>
        </motion.div>
      </div>
    </section>
  );
}
