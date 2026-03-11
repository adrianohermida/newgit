import React from "react";
import { motion } from "framer-motion";
import { TrendingDown, PiggyBank, Building2, CheckCircle, ArrowRight, Scale, Shield, Users, Briefcase } from "lucide-react";

const GOLD = "#C5A059";

const SERVICES = [
  {
    Icon: TrendingDown,
    title: "Defesa contra Juros Abusivos",
    desc: "Milhares de contratos bancários possuem cláusulas abusivas que sobrecarregam o consumidor. Realizamos uma análise técnica minuciosa para identificar taxas ilegais e juros capitalizados indevidamente.",
    items: [
      "Revisionais de Financiamento de Veículos",
      "Contratos de Empréstimo Pessoal e Consignado",
      "Cartão de Crédito e Cheque Especial",
    ],
    cta: { label: "Consultar meu contrato", Icon: ArrowRight },
    ctaVariant: "dark",
    image: "/servicos_juros.jpg",
    reverse: false,
  },
  {
    Icon: PiggyBank,
    title: "Lei do Superendividamento",
    desc: "A Lei 14.181/21 protege o consumidor que não consegue mais pagar suas dívidas sem comprometer o mínimo para sua sobrevivência. Auxiliamos na renegociação global de seus débitos.",
    cards: [
      { title: "Plano de Pagamento", desc: "Criação de um plano de pagamento que caiba no seu orçamento real." },
      { title: "Mínimo Existencial", desc: "Garantia de recursos para as necessidades básicas da sua família." },
    ],
    cta: { label: "Quero me reestruturar", Icon: Scale },
    ctaVariant: "outline",
    image: "/servicos_superendividamento.jpg",
    reverse: true,
  },
  {
    Icon: Building2,
    title: "Recuperação Judicial",
    desc: "Para empresas em crise, a recuperação judicial é o caminho legal para evitar a falência, manter empregos e renegociar prazos com credores sob proteção da justiça.",
    highlights: [
      { Icon: Shield, title: "Suspensão de Execuções", desc: "Período de blindagem contra cobranças e penhoras." },
      { Icon: Users, title: "Negociação com Credores", desc: "Mediação especializada para novos prazos e descontos." },
    ],
    cta: { label: "Falar com Especialista", Icon: Briefcase },
    ctaVariant: "gold",
    image: "/servicos_recuperacao.jpg",
    reverse: false,
  },
];

function HighlightRow({ item }) {
  const HIcon = item.Icon;
  return (
    <div className="flex items-start gap-4 rounded-lg p-4" style={{ background: "rgba(17,212,115,0.05)" }}>
      <HIcon size={20} style={{ color: GOLD, flexShrink: 0, marginTop: 2 }} />
      <div>
        <h5 className="font-bold" style={{ color: "#0f172a" }}>{item.title}</h5>
        <p className="text-sm mt-1" style={{ color: "#475569" }}>{item.desc}</p>
      </div>
    </div>
  );
}

function ServiceBlock({ service, index }) {
  const { Icon: ServiceIcon, title, desc, items, cards, highlights, cta, ctaVariant, image, reverse } = service;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7 }}
      className={`mb-24 flex flex-col items-center gap-12 lg:flex-row ${reverse ? "lg:flex-row-reverse" : ""}`}
    >
      {/* Text */}
      <div className="flex-1 space-y-6">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "rgba(197,160,89,0.1)" }}
        >
          <ServiceIcon size={28} style={{ color: GOLD }} />
        </div>

        <h2 className="text-3xl font-bold tracking-tight lg:text-4xl" style={{ color: "#F4F1EA" }}>
          {title}
        </h2>

        <p className="text-lg leading-relaxed" style={{ color: GOLD }}>
          {desc}
        </p>

        {/* Checklist */}
        {items && (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle size={20} style={{ color: GOLD, flexShrink: 0 }} />
                <span style={{ color: "#F4F1EA" }}>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Cards grid */}
        {cards && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cards.map((card) => (
              <div
                key={card.title}
                className="rounded-xl border p-6"
                style={{ borderColor: "rgba(197,160,89,0.2)", background: "#232323" }}
              >
                <h4 className="font-bold mb-2" style={{ color: GOLD }}>{card.title}</h4>
                <p className="text-sm" style={{ color: "#F4F1EA" }}>{card.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Highlight rows */}
        {highlights && (
          <div className="space-y-3">
            {highlights.map((h) => <HighlightRow key={h.title} item={{...h, Icon: h.Icon, color: GOLD}} />)}
          </div>
        )}

        {/* CTA Button */}
        {(() => {
          const CtaIcon = cta.Icon;
          if (ctaVariant === "dark") return (
            <button
              className="mt-4 flex items-center gap-2 rounded-lg px-6 py-3 font-bold text-[#C5A059] transition-colors hover:bg-[#C5A059] hover:text-[#050706]"
              style={{ background: "#232323" }}
            >
              {cta.label}
              <CtaIcon size={16} />
            </button>
          );
          if (ctaVariant === "outline") return (
            <button
              className="mt-4 flex items-center gap-2 rounded-lg border-2 px-6 py-3 font-bold transition-all hover:bg-[#C5A059] hover:text-[#050706]"
              style={{ borderColor: "#C5A059", color: "#C5A059" }}
            >
              {cta.label}
              <CtaIcon size={16} />
            </button>
          );
          return (
            <button
              className="mt-4 flex items-center gap-2 rounded-lg px-6 py-3 font-bold transition-transform hover:scale-105"
              style={{ background: "#C5A059", color: "#050706", boxShadow: "0 8px 25px rgba(197,160,89,0.25)" }}
            >
              {cta.label}
              <CtaIcon size={16} />
            </button>
          );
        })()}
      </div>

      {/* Image */}
      <div className="w-full flex-1 overflow-hidden rounded-2xl shadow-2xl lg:max-w-xl" style={{ background: "#050706" }}>
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover"
          style={{ aspectRatio: "4/3", background: "#050706" }}
        />
      </div>
    </motion.div>
  );
}

export default function ServicosList() {
  return (
    <section className="py-20 lg:py-32" style={{ background: "#f6f8f7" }}>
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {SERVICES.map((service, i) => (
          <ServiceBlock key={service.title} service={service} index={i} />
        ))}
      </div>
    </section>
  );
}
