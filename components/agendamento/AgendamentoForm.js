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
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [slotsApiError, setSlotsApiError] = useState(false);
  useEffect(() => {
    const fetchSlots = async () => {
      const slots = {};
      const today = new Date();
      let apiOk = true;
      for (let i = 1; i <= 30; i++) {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
        if (date >= today && date.getDay() !== 0 && date.getDay() !== 6) {
          const dateStr = date.toISOString().split('T')[0];
          try {
            const res = await fetch(`/api/slots?data=${dateStr}`);
            const data = await res.json();
            if (data.ok) {
              slots[dateStr] = data.slots;
            } else {
              slots[dateStr] = [];
              apiOk = false;
            }
          } catch {
            slots[dateStr] = ["09:00", "10:30", "14:00", "15:30", "17:00"];
            apiOk = false;
          }
        }
      }
      // ...existing code...
    };
    fetchSlots();
  }, [currentMonth]);

  // Centralização do formulário na tela
  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="w-full">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <AreaStep
              AREAS={AREAS}
              selectedArea={selectedArea}
              setSelectedArea={setSelectedArea}
              onContinue={() => setStep(2)}
            />
          )}
          {/* ...outros steps... */}
        </AnimatePresence>
      </div>
    </div>
  );
}
      setAvailableSlots(slots);
      setSlotsApiError(!apiOk);
    };
    fetchSlots();
    // eslint-disable-next-line
  }, [currentMonth]);

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      const prevMonthDay = new Date(year, month, -i);
      days.unshift({ day: prevMonthDay.getDate(), isPrevMonth: true, date: prevMonthDay });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push({ day, isPrevMonth: false, date });
    }
    return days;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const getAvailableTimes = () => {
    if (!selectedDate) return [];
    const dateStr = selectedDate.toISOString().split('T')[0];
    return availableSlots[dateStr] || [];
  };

  const handleSubmit = async () => {
    // Validação de campos obrigatórios
    if (!formData.nome || !formData.email || !formData.telefone || !selectedDate || !selectedTime) {
      alert("Por favor, preencha todos os campos obrigatórios: Nome, E-mail, Telefone, Data e Horário.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/agendar", {
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
  };


  // DEBUG: Log de estado
  if (typeof window !== "undefined") {
    console.log("[AgendamentoForm] step:", step, "success:", success, { selectedArea, selectedDate, selectedTime, formData });
  }


  if (success) {
    return <SuccessStep selectedDate={selectedDate} selectedTime={selectedTime} />;
  }

  // Aviso para fallback estático
  const FallbackWarning = () => slotsApiError ? (
    <div style={{ background: '#fffbe6', color: '#bfa100', padding: 12, borderRadius: 8, marginBottom: 16, textAlign: 'center', fontWeight: 'bold' }}>
      Aviso: Este formulário está em modo demonstração. Os horários exibidos são exemplos e o agendamento real só funcionará em ambiente com backend ativo.
    </div>
  ) : null;

  // Fallback visual: se algo der errado, mostra um aviso e o formulário básico
  try {
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
  } catch (err) {
    if (typeof window !== "undefined") {
      console.error("[AgendamentoForm] Erro de renderização:", err);
    }
    return (
      <div className="p-8 text-center text-red-500">
        Ocorreu um erro ao carregar o formulário de agendamento.<br />
        Tente recarregar a página ou entre em contato com o suporte.<br />
        <pre style={{ color: 'red', marginTop: 16 }}>{err?.message}</pre>
      </div>
    );
  }
}
