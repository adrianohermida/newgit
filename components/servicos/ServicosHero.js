import React from "react";
import { motion } from "framer-motion";

const BG_IMAGE = "/images/servicos/servicos_hero.jpg";

export default function ServicosHero() {
  return (
    <section className="relative overflow-hidden hero-gradient py-24 lg:py-40" style={{ background: "radial-gradient(circle at top right, #1B4332, #050706 70%)" }}>
      {/* Imagem de fundo com opacidade */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuCpk6ygOKvoTf6APh7ETs_6fldQt_5-SF5WSmXAE_VOv4syulQOXJuVaK-s31582zK1yvTUHfZfleRHCSATX-q8va37bqbOr9Os9VlnXoYIgeD5BBnvNPf2GHtJWvkLEK0TBVoOsar1IV92c20NXsQBnwNn3LnwV11YNFVOAEJM_ymmG-r-PiOSvHY84ru2b-v7b7WRIK8HG0lzOQlPWs-xdGoaXCYbpKWRIDKmhtHStNzM80ZhJ6vaBchjaopV13BFsIYwXIzH-78h')`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-12">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/30 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
            Advocacia de Alta Performance
          </span>
          <h1 className="mt-8 text-5xl font-black leading-[1.1] text-white lg:text-8xl">
            Proteção Jurídica e <span className="gold-gradient-text">Excelência</span> Patrimonial
          </h1>
          <p className="mt-10 max-w-xl text-lg leading-relaxed text-slate-400">
            Estratégias jurídicas de elite em Direito Bancário e Reestruturação de Passivos. Soluções sob medida para quem exige rigor técnico e discrição absoluta.
          </p>
          <div className="mt-12 flex flex-wrap gap-5">
            <button className="rounded-full bg-primary px-10 py-5 text-sm font-black uppercase tracking-widest text-background-dark shadow-2xl shadow-primary/20 transition-all hover:scale-105 hover:shadow-primary/40">
              Agendar Consultoria
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
