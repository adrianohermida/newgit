import React from "react";
import { motion } from "framer-motion";

const GREEN = "#11d473";

export default function ServicosCTA() {
  return (
    <section className="py-20 lg:py-32" style={{ background: "#f6f8f7" }}>
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl px-8 py-16 text-center lg:px-16 lg:py-24"
          style={{ background: "#0f172a" }}
        >
          {/* Decorative blobs */}
          <div
            className="absolute -right-16 -top-16 h-64 w-64 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(17,212,115,0.15)" }}
          />
          <div
            className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(17,212,115,0.08)" }}
          />

          <div className="relative z-10 mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold text-white lg:text-5xl mb-6">
              Pronto para recuperar sua{" "}
              <span style={{ color: GREEN }}>liberdade financeira?</span>
            </h2>
            <p className="text-lg mb-10" style={{ color: "#94a3b8" }}>
              Agende agora uma consulta com um de nossos advogados especialistas e proteja seu patrimônio.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="https://wa.me/555131810323"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full px-8 py-4 font-bold transition-transform hover:scale-105"
                style={{ background: GREEN, color: "#102219" }}
              >
                Falar pelo WhatsApp
              </a>
              <a
                href="tel:+5551810323"
                className="rounded-full border border-white/20 px-8 py-4 font-bold text-white transition-colors hover:bg-white/10"
              >
                (51) 3181-0323
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
