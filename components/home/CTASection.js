import React from "react";
import { motion, useInView } from "framer-motion";

export default function CTASection() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="py-24 lg:py-32 bg-black">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="font-serif text-4xl md:text-5xl font-light mb-8"
        >
          Pronto para começar?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-lg opacity-60 mb-10"
        >
          Simule sua economia agora mesmo e receba uma análise gratuita do seu caso.
        </motion.p>
        <motion.a
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.4 }}
          href="#calculadora"
          className="inline-block px-8 py-4 rounded font-semibold text-black text-sm tracking-[0.15em] uppercase"
          style={{ background: "#C5A059" }}
        >
          Simular agora
        </motion.a>
      </div>
    </section>
  );
}
