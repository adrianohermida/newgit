
import React from "react";
import { motion } from "framer-motion";

export default function SocialProofBar() {
  return (
    <section className="py-12" style={{ borderTop: "1px solid #2D2E2E", borderBottom: "1px solid #2D2E2E" }}>
      <div className="mx-auto max-w-7xl px-6">
        <p 
          className="text-center text-[10px] font-semibold tracking-[0.3em] uppercase mb-10 opacity-40"
          style={{ color: "#C5A059" }}
        >
          Reconhecimento & Credibilidade
        </p>
        <div className="flex flex-wrap items-center justify-center gap-10 md:gap-16 opacity-25">
          <span className="text-xl font-bold italic font-serif" style={{ color: "#F4F1EA" }}>EXAME</span>
          <span className="text-xl font-bold" style={{ color: "#F4F1EA" }}>G1</span>
          <span className="text-xl font-black tracking-wider" style={{ color: "#F4F1EA" }}>VALOR</span>
          <span className="text-xl font-serif italic" style={{ color: "#F4F1EA" }}>CNN</span>
          <div className="flex items-center gap-2" style={{ color: "#F4F1EA" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12l2 2 4-4" />
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
            </svg>
            <span className="font-bold text-sm tracking-wider">OAB CERTIFICADO</span>
          </div>
        </div>
      </div>
    </section>
  );
}
