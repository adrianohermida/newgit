import React from "react";
import { motion } from "framer-motion";
import { TrendingDown, PiggyBank, Building2, CheckCircle, ArrowRight, Scale, Shield, Users, Briefcase } from "lucide-react";

const GOLD = "#C5A059";

const SERVICES = [
  {
    Icon: TrendingDown,
    title: "Defesa contra Juros Abusivos",
    desc: "Nossa atuação foca na preservação integral do seu patrimônio através da identificação cirúrgica de cláusulas ilegais e abusividades contratuais que corroem sua rentabilidade.",
    items: [
      "Blindagem Patrimonial e bloqueio de execuções",
      "Recálculo pericial de contratos de alta complexidade",
      "Redução substantiva do valor total da dívida",
    ],
    cta: { label: "Avaliar Contrato Agora", Icon: ArrowRight },
    ctaVariant: "dark",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAnfCjMvsh-X8LREr6063t9Y09D_f3-eWj6Y1O19p3u25fQY48995_u_h8o_6l",
    reverse: false,
  },
  {
    Icon: PiggyBank,
    title: "Lei do Superendividamento",
    desc: "Aplicação estratégica da Lei 14.181/2021 para garantir a dignidade financeira. Elaboramos planos de repagamento globais que respeitam a viabilidade econômica do cliente.",
    cards: [
      { title: "Mínimo Existencial", desc: "Garantia jurídica de que os recursos básicos para sua subsistência não serão atingidos." },
      { title: "Repactuação Global", desc: "Negociação compulsória com todos os credores para um plano único de até 5 anos." },
    ],
    cta: { label: "Solicitar Plano de Reestruturação", Icon: Scale },
    ctaVariant: "outline",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCCjSDK-6vcNbBpeG6x9SFEdzWYodw49WFbZIhLMOqa3uoQRb71nuLOE8T-KJ_4C-RkDZBlkQt99-8ky3IdlOtgM5yZpcPPD4H-bbhHt9gV69ahvp7uDBjsaejhb0ynqUiMCavSYtsnnxxqBcnpa6S1y8YEQC5z-rulupRo3KcAidllaE4jv6pxltkb2UBeM0iLXTbvKKW8jS-zIg13Yal3grfBw4uHEY_PpQ_jRTo8rqLs8sum5_r-jpg4TmlM94x9PlUetHF5IdSX",
    reverse: true,
  },
  {
    Icon: Building2,
    title: "Direito Bancário Estratégico",
    desc: "Litigância de alta complexidade contra instituições financeiras. Nossa banca jurídica emprega táticas avançadas para reverter prejuízos e consolidar vitórias judiciais definitivas.",
    highlights: [
      { Icon: Shield, title: "Contencioso de Elite", desc: "Defesa em casos complexos de fraudes, limites de crédito e garantias reais." },
      { Icon: Users, title: "Recuperação de Crédito Profissional", desc: "Métodos eficientes e éticos para recuperação de ativos financeiros em larga escala." },
    ],
    cta: { label: "Consultar Nossa Banca", Icon: Briefcase },
    ctaVariant: "gold",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAyeaifF3jA9VF4sk8y1MkKz__APx1qEfTaW5BKLtcf1bh7-10CnORFK0QKk_3m5ujmAoMaw7GvBog8jMuXcnIArPdmp1chA5iWiBiDkbJDClvx65DlEFb29fYT30NSDN1TURcZhiwaqCb34dDicNf5eOs_WbfeuWDc-C3KHrgkpDtSOa16x9hv9QebVMQ_VeO-gwmh2k_Uvz8O7wpAh5gpuF0g_f78QKJ7GVjeYYxwG6NjBBmq-c2lAxLcz0FO-5eoilCgr2YqHY0f",
    reverse: false,
  },
];

function HighlightRow({ item }) {
  const HIcon = item.Icon;
  return (
    <div className="flex items-start gap-4 rounded-lg p-4" style={{ background: "#181a1b" }}>
      <HIcon size={20} style={{ color: GOLD, flexShrink: 0, marginTop: 2 }} />
      <div>
        <h5 className="font-bold" style={{ color: "#F4F1EA" }}>{item.title}</h5>
        <p className="text-sm mt-1" style={{ color: "#C5A059", opacity: 0.8 }}>{item.desc}</p>
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
      style={{ background: "#181a1b", borderRadius: 24, border: "1px solid #232323" }}
    >
      {/* Text */}
      <div className="flex-1 space-y-6">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "#232323" }}
        >
          <ServiceIcon size={28} style={{ color: GOLD }} />
        </div>

        <h2 className="text-3xl font-bold tracking-tight lg:text-4xl" style={{ color: "#F4F1EA" }}>
          {title}
        </h2>

        <p className="text-lg leading-relaxed" style={{ color: "#C5A059", opacity: 0.85 }}>
          {desc}
        </p>

        {/* Checklist */}
        {items && (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle size={20} style={{ color: GOLD, flexShrink: 0 }} />
                <span style={{ color: "#F4F1EA", opacity: 0.9 }}>{item}</span>
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
                <button
                  key={time}
                  onClick={() => setSelectedTime(time)}
                  className={`px-3 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all ${selectedTime === time ? 'bg-[#C5A059] text-black ring-2 ring-[#C5A059]' : 'bg-black/40 text-[#F4F1EA] hover:bg-[#C5A059]/10 hover:text-[#C5A059]'}`}
                >
                  {time}
                </button>
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
      <div className="w-full flex-1 overflow-hidden rounded-2xl shadow-2xl lg:max-w-xl" style={{ background: "#181a1b" }}>
        <img
          src={image}
          alt={`Serviço jurídico: ${title} - especialista em superendividamento, revisão bancária, contratos e defesa contra juros abusivos`}
          className="h-full w-full object-cover"
          style={{ aspectRatio: "4/3", background: "#050706" }}
        />
      </div>
    </motion.div>
  );
}

export default function ServicosList() {
  return (
    <section className="py-20 lg:py-32" style={{ background: "#050706" }}>
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <h1 className="text-4xl font-black mb-12 text-[#C5A059]">Serviços Jurídicos: Superendividamento, Juros Abusivos, Contratos e Direito Bancário</h1>
        {SERVICES.map((service, i) => (
          <ServiceBlock key={service.title} service={service} index={i} />
        ))}
      </div>
    </section>
  );
}
