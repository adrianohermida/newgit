import React from "react";
import { motion, useInView } from "framer-motion";

export default function HeroSection() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="relative py-32 lg:py-48 overflow-hidden bg-black">
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{backgroundImage: `url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/hero-bg.png')`, backgroundSize: 'cover', backgroundPosition: 'center'}} />
      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="font-serif text-5xl md:text-7xl font-light mb-8"
        >
          Livre-se das dívidas <span className="italic" style={{ color: "#C5A059" }}>abusivas</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-2xl opacity-60 mb-10"
        >
          Use inteligência jurídica para reduzir juros e conquistar sua liberdade financeira.
        </motion.p>
        <motion.a
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.4 }}
          href="#calculadora"
          className="inline-block px-8 py-4 rounded font-semibold text-black text-sm tracking-[0.15em] uppercase"
          style={{ background: "#C5A059" }}
        >
          Simule sua economia
        </motion.a>
      </div>
    </section>
  );
}
