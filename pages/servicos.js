import React from "react";
import ServicosHero from "@/components/servicos/ServicosHero";
import ServicosList from "@/components/servicos/ServicosList";
import ServicosFAQ from "@/components/servicos/ServicosFAQ";
import ServicosCTA from "@/components/servicos/ServicosCTA";

export default function Servicos() {
  return (
    <div style={{ background: "#f6f8f7", color: "#0f172a" }}>
      <ServicosHero />
      <ServicosList />
      <ServicosFAQ />
      <ServicosCTA />
    </div>
  );
}
