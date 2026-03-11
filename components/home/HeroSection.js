import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

const HERO_IMAGE = "/perfil_1.webp";

export default function HeroSection() {
  const sectionRef = useRef(null);

  return (
    <section ref={sectionRef} className="relative min-h-screen flex items-center overflow-hidden pt-24 pb-16 lg:pt-0 lg:pb-0">
      {/* Background gradient */}
      <div className="absolute inset-0 z-0">
        <div 
          className="absolute inset-0"
          style={{ 
            background: "radial-gradient(ellipse at 70% 50%, rgba(27, 67, 50, 0.3) 0%, transparent 60%)" 
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 w-full">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-center min-h-[85vh]">
          
          {/* Text block - overlaps image on desktop */}
          <div className="lg:col-span-6 xl:col-span-5 relative z-20">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-flex items-center gap-2 border px-5 py-2 text-xs font-semibold tracking-[0.15em] uppercase mb-8"
              style={{ borderColor: "rgba(197, 160, 89, 0.3)", color: "#C5A059" }}
            >
              <span className="w-2 h-2 rounded-full bg-[#C5A059]" />
              Proteção Legal Especializada
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="font-serif text-5xl md:text-6xl lg:text-7xl xl:text-[5.5rem] font-light leading-[0.95] mb-8"
              style={{ color: "#F4F1EA" }}
            >
              Elimine até{" "}
              <span className="text-gold-gradient font-medium italic">70%</span>
              <br />
              das suas
              <br />
              <span className="font-medium">dívidas</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="text-base md:text-lg leading-relaxed max-w-lg mb-10 opacity-50"
            >
              Somos especialistas em superendividamento e defesa contra juros abusivos. 
              Recupere sua tranquilidade financeira com suporte jurídico de elite.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="flex flex-wrap gap-4 mb-14"
            >
              <a
                href="https://wa.me/5511400040000"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-3 px-8 py-4 text-sm font-semibold tracking-[0.1em] uppercase transition-all duration-300"
                style={{ 
                  background: "#C5A059",
                  color: "#050706",
                }}
              >
                Falar com Especialista
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="#calculadora"
                className="inline-flex items-center gap-3 px-8 py-4 text-sm font-semibold tracking-[0.1em] uppercase border transition-all duration-300 hover:bg-[#F4F1EA]/5"
                style={{ borderColor: "rgba(244, 241, 234, 0.2)", color: "#F4F1EA" }}
              >
                Calcular Economia
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="flex items-center gap-8"
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl font-serif font-light" style={{ color: "#C5A059" }}>10k+</span>
                <span className="text-xs opacity-40 leading-tight">Famílias<br/>recuperadas</span>
              </div>
              <div className="w-px h-8" style={{ background: "#2D2E2E" }} />
              <div className="flex items-center gap-3">
                <span className="text-3xl font-serif font-light" style={{ color: "#C5A059" }}>98%</span>
                <span className="text-xs opacity-40 leading-tight">Taxa de<br/>sucesso</span>
              </div>
              <div className="w-px h-8 hidden sm:block" style={{ background: "#2D2E2E" }} />
              <div className="hidden sm:flex items-center gap-3">
                <span className="text-3xl font-serif font-light" style={{ color: "#C5A059" }}>R$35M</span>
                <span className="text-xs opacity-40 leading-tight">Dívidas<br/>renegociadas</span>
              </div>
            </motion.div>
          </div>

          {/* Hero Image */}
          <motion.div 
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.2 }}
            className="lg:col-span-6 xl:col-span-7 lg:col-start-7 xl:col-start-6 mt-16 lg:mt-0 relative"
          >
            <div className="relative">
              <div 
                className="aspect-[3/4] lg:aspect-[4/5] overflow-hidden"
                style={{ 
                  clipPath: "polygon(8% 0, 100% 0, 100% 100%, 0 100%, 0 8%)"
                }}
              >
                <img
                  alt="Advogado Hermida Maia"
                  src={HERO_IMAGE}
                  className="w-full h-full object-cover"
                  style={{ filter: "contrast(1.1) brightness(0.9)" }}
                />
                {/* Dark overlay gradient */}
                <div 
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to right, rgba(5, 7, 6, 0.6) 0%, transparent 50%)" }}
                />
              </div>

              {/* Decorative corner lines */}
              <div 
                className="absolute -top-4 -left-4 w-20 h-20 hidden lg:block"
                style={{ 
                  borderLeft: "1px solid rgba(197, 160, 89, 0.3)",
                  borderTop: "1px solid rgba(197, 160, 89, 0.3)",
                }}
              />
              <div 
                className="absolute -bottom-4 -right-4 w-20 h-20 hidden lg:block"
                style={{ 
                  borderRight: "1px solid rgba(197, 160, 89, 0.3)",
                  borderBottom: "1px solid rgba(197, 160, 89, 0.3)",
                }}
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 hidden lg:flex"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase opacity-30">Scroll</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-px h-8"
          style={{ background: "linear-gradient(to bottom, #C5A059, transparent)" }}
        />
      </motion.div>
    </section>
  );
}
