import React, { useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
// import { base44 } from "@/api/base44Client"; // Descomente se o client estiver implementado

const DEBT_TYPES = [
  { value: "cartao_credito", label: "Cartão de Crédito / Cheque Especial", rate: 0.65 },
  { value: "emprestimo_consignado", label: "Empréstimo Consignado", rate: 0.35 },
  { value: "financiamento_veiculo", label: "Financiamento de Veículo", rate: 0.50 },
  { value: "outros", label: "Outros", rate: 0.45 },
];

export default function CalculatorSection() {
  const [debtAmount, setDebtAmount] = useState(50000);
  const [debtType, setDebtType] = useState("cartao_credito");
  const [whatsapp, setWhatsapp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const selectedType = DEBT_TYPES.find(d => d.value === debtType);
  const savings = Math.round(debtAmount * (selectedType?.rate || 0.5));
  const luminosity = Math.min(0.15, (debtAmount / 500000) * 0.15);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!whatsapp) return;
    setIsSubmitting(true);
    // await base44.entities.Lead.create({
    //   whatsapp,
    //   debt_amount: debtAmount,
    //   debt_type: debtType,
    //   estimated_savings: savings,
    //   status: "novo",
    // });
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 1200); // Simulação de envio
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  return (
    <section 
      id="calculadora" 
      ref={ref}
      className="py-24 lg:py-32 relative overflow-hidden"
      style={{ 
        background: `radial-gradient(ellipse at 50% 50%, rgba(27, 67, 50, ${luminosity}) 0%, #050706 70%)`,
        transition: "background 0.5s ease",
      }}
    >
      {/* Atmospheric image overlay */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/3f356e7c6_generated_image.png')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="lg:grid lg:grid-cols-2 lg:gap-20 items-center">
          {/* Left content */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
          >
            <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-4" style={{ color: "#C5A059" }}>
              Simulador
            </p>
            <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-light mb-6">
              Simule sua <span className="italic" style={{ color: "#C5A059" }}>economia</span> agora
            </h2>
            <p className="text-base leading-relaxed opacity-50 mb-10 max-w-lg">
              Nossa calculadora utiliza inteligência jurídica para estimar quanto você pode economizar 
              ao contestar juros abusivos e aplicar a Lei do Superendividamento.
            </p>

            <div className="space-y-5">
              {["Resultado instantâneo","Análise 100% gratuita","Sem compromisso"].map((item) => (
                <div key={item} className="flex items-center gap-4">
                  <div className="w-6 h-6 flex items-center justify-center border border-[#C5A059]/30 rounded-full">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="3">
                      <path d="M5 12l5 5L20 6" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium opacity-60">{item}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Calculator */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-12 lg:mt-0"
          >
            <div 
              className="p-8 md:p-10"
              style={{ 
                background: "rgba(13, 15, 14, 0.9)",
                border: "1px solid #2D2E2E",
                backdropFilter: "blur(20px)",
              }}
            >
              {!submitted ? (
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="text-center mb-2">
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase opacity-40 mb-2">Economia estimada</p>
                    <p className="text-4xl md:text-5xl font-serif font-light text-gold-gradient">
                      {formatCurrency(savings)}
                    </p>
                  </div>

                  <div className="w-full h-px" style={{ background: "#2D2E2E" }} />

                  {/* Debt slider */}
                  <div>
                    <div className="flex justify-between items-baseline mb-4">
                      <label className="text-xs font-semibold tracking-[0.15em] uppercase opacity-50">
                        Valor das Dívidas
                      </label>
                      <span className="text-lg font-serif" style={{ color: "#C5A059" }}>
                        {formatCurrency(debtAmount)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="5000"
                      max="500000"
                      step="1000"
                      value={debtAmount}
                      onChange={(e) => setDebtAmount(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-2">
                      <span className="text-[10px] opacity-30">R$ 5.000</span>
                      <span className="text-[10px] opacity-30">R$ 500.000</span>
                    </div>
                  </div>

                  {/* Debt type */}
                  <div>
                    <label className="text-xs font-semibold tracking-[0.15em] uppercase opacity-50 block mb-3">
                      Tipo de Dívida
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {DEBT_TYPES.map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => setDebtType(type.value)}
                          className="text-left px-4 py-3 text-xs font-medium transition-all duration-200"
                          style={{
                            border: `1px solid ${debtType === type.value ? "#C5A059" : "#2D2E2E"}`,
                            color: debtType === type.value ? "#C5A059" : "rgba(244, 241, 234, 0.5)",
                            background: debtType === type.value ? "rgba(197, 160, 89, 0.05)" : "transparent",
                          }}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label className="text-xs font-semibold tracking-[0.15em] uppercase opacity-50 block mb-3">
                      Seu WhatsApp
                    </label>
                    <input
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      className="w-full bg-transparent px-4 py-3 text-sm outline-none transition-colors"
                      style={{ 
                        border: "1px solid #2D2E2E",
                        color: "#F4F1EA",
                      }}
                      onFocus={(e) => e.target.style.borderColor = "#C5A059"}
                      onBlur={(e) => e.target.style.borderColor = "#2D2E2E"}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !whatsapp}
                    className="w-full py-4 text-sm font-semibold tracking-[0.15em] uppercase transition-all duration-300 disabled:opacity-50"
                    style={{
                      background: "#C5A059",
                      color: "#050706",
                    }}
                  >
                    {isSubmitting ? "Enviando..." : "Calcular Economia →"}
                  </button>

                  <p className="text-[10px] text-center opacity-25">
                    Ao simular, você concorda com nossa Política de Privacidade.
                  </p>
                </form>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center rounded-full" style={{ border: "1px solid #C5A059" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="2">
                      <path d="M5 12l5 5L20 6" />
                    </svg>
                  </div>
                  <h4 className="font-serif text-2xl mb-3">Simulação enviada!</h4>
                  <p className="text-sm opacity-50 mb-2">
                    Economia estimada: <span className="text-gold-gradient font-semibold">{formatCurrency(savings)}</span>
                  </p>
                  <p className="text-sm opacity-40">
                    Um especialista entrará em contato em breve.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
