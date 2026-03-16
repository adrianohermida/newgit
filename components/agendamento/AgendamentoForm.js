import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import AreaStep from "./steps/AreaStep";
import DateStep from "./steps/DateStep";
import ClientStep from "./steps/ClientStep";
import SuccessStep from "./steps/SuccessStep";

// DEBUG: Log para garantir que o componente está sendo renderizado
if (typeof window !== "undefined") {
  console.log("[AgendamentoForm] Componente carregado");
}
const AREAS = [
  { id: "superendividamento", title: "Superendividamento", desc: "Recuperação financeira e judicial" },
  { id: "bancario", title: "Direito Bancário", desc: "Revisão de contratos e juros" },
  { id: "civil", title: "Direito Civil", desc: "Causas gerais e contratos" },
  { id: "outros", title: "Outros Assuntos", desc: "Consultoria diversificada" },
];

export default function AgendamentoForm() {
  const [step, setStep] = useState(1);
  const [selectedArea, setSelectedArea] = useState("superendividamento");
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availableSlots, setAvailableSlots] = useState({});
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    observacoes: ""
  });
  const [success, setSuccess] = useState(false);
  const [slotsApiError, setSlotsApiError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Utilitário para obter a base da API (Cloudflare/produção ou local)
  function getApiBase() {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return "http://localhost:8787/api";
    }
    // Para deploy estático (ex: GitHub Pages), usar caminho relativo
    return "/api";
  }

  // Funções para navegação de mês
  function handlePrevMonth() {
    setCurrentMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  }
  function handleNextMonth() {
    setCurrentMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  }

  // Retorna todos os dias do mês atual para o calendário
  function getDaysInMonth() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    // Preencher dias do mês anterior para alinhar o calendário
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push({ date: new Date(year, month, i - firstDay.getDay() + 1), isPrevMonth: true });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ date: new Date(year, month, d), isPrevMonth: false });
    }
    return days;
  }

  // Retorna horários disponíveis para o dia selecionado
  function getAvailableTimes(date) {
    if (!date) return [];
    const dateStr = date.toISOString().split('T')[0];
    return availableSlots[dateStr] || [];
  }
  useEffect(() => {
    const fetchSlots = async () => {
      const slots = {};
      const today = new Date();
      let apiOk = true;
      const apiBase = getApiBase();
      for (let i = 1; i <= 30; i++) {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
        if (date >= today && date.getDay() !== 0 && date.getDay() !== 6) {
          const dateStr = date.toISOString().split('T')[0];
          let data = null;
          try {
            const res = await fetch(`${apiBase}/slots?data=${dateStr}`);
            if (res.status === 404) {
              // Tenta buscar arquivo estático
              const staticRes = await fetch(`/slots/${dateStr}.json`);
              if (staticRes.ok) {
                data = await staticRes.json();
              } else {
                data = { ok: true, slots: ["09:00", "10:30", "14:00", "15:30", "17:00"] };
                apiOk = false;
              }
            } else {
              data = await res.json();
            }
            if (data && data.ok) {
              slots[dateStr] = data.slots;
            } else {
              slots[dateStr] = [];
              apiOk = false;
            }
          } catch {
            // fallback: mock slots
            slots[dateStr] = ["09:00", "10:30", "14:00", "15:30", "17:00"];
            apiOk = false;
          }
        }
      }
      setAvailableSlots(slots);
      setSlotsApiError(!apiOk);
    };
    fetchSlots();
    // eslint-disable-next-line
  }, [currentMonth]);

  async function handleSubmit() {
    if (!formData.nome || !formData.email || !formData.telefone || !selectedDate || !selectedTime) {
      alert("Por favor, preencha todos os campos obrigatórios: Nome, E-mail, Telefone, Data e Horário.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/agendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: formData.nome,
          email: formData.email,
          telefone: formData.telefone,
          observacoes: formData.observacoes,
          area: AREAS.find(a => a.id === selectedArea)?.title,
          data: selectedDate?.toISOString().split('T')[0],
          hora: selectedTime,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(true);
      } else {
        alert("Erro ao agendar: " + (data.error || "Tente novamente."));
      }
    } catch (error) {
      alert("Erro ao realizar agendamento. Tente novamente.");
    }
    setSubmitting(false);
  }

  if (success) {
    return <SuccessStep selectedDate={selectedDate} selectedTime={selectedTime} />;
  }

  // Aviso removido conforme solicitado
  const FallbackWarning = () => null;

  return (
    <div style={{ background: "#050706", minHeight: "100vh" }}>
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <FallbackWarning />
        <AnimatePresence mode="wait">
          {step === 1 && (
            <AreaStep
              AREAS={AREAS}
              selectedArea={selectedArea}
              setSelectedArea={setSelectedArea}
              onContinue={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <DateStep
              currentMonth={currentMonth}
              handlePrevMonth={handlePrevMonth}
              handleNextMonth={handleNextMonth}
              getDaysInMonth={getDaysInMonth}
              availableSlots={availableSlots}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              selectedTime={selectedTime}
              setSelectedTime={setSelectedTime}
              getAvailableTimes={getAvailableTimes}
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <ClientStep
              AREAS={AREAS}
              selectedArea={selectedArea}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              formData={formData}
              setFormData={setFormData}
              onBack={() => setStep(2)}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}




