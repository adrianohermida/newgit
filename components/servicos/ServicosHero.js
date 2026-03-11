import React from "react";
import { motion } from "framer-motion";

const BG_IMAGE = "/servicos_hero.jpg";

export default function ServicosHero() {
  return (
    <section className="relative overflow-hidden py-28 lg:py-40" style={{ background: "#102219" }}>
      <div
        className="absolute inset-0 opacity-20"
        style={{ backgroundImage: `url('${BG_IMAGE}')`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, #102219 0%, rgba(16,34,25,0.75) 60%, transparent 100%)" }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-12">
        <div className="max-w-2xl">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block rounded-full px-4 py-1 text-xs font-bold uppercase tracking-widest mb-6"
            style={{ background: "rgba(17,212,115,0.15)", color: "#11d473" }}
          >
            Nossa Expertise
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-black leading-tight text-white lg:text-6xl mb-6"
          >
            Soluções Jurídicas para sua{" "}
            <span style={{ color: "#11d473" }}>Saúde Financeira</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg leading-relaxed"
            style={{ color: "#94a3b8" }}
          >
            Atuação estratégica em Direito Bancário e Recuperação Judicial, protegendo seu patrimônio e
            garantindo seus direitos perante instituições financeiras.
          </motion.p>
        </div>
      </div>
    </section>
  );
}
