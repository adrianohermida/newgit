import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import AreaStep from "./steps/AreaStep";
import DateStep from "./steps/DateStep";
import ClientStep from "./steps/ClientStep";
import SuccessStep from "./steps/SuccessStep";
import { formatDateKey } from "./dateUtils";

// DEBUG: Log para garantir que o componente estÃ¡ sendo renderizado
if (typeof window !== "undefined") {
  console.log("[AgendamentoForm] Componente carregado");
}
const AREAS = [
  { id: "superendividamento", title: "Superendividamento", desc: "RecuperaÃ§Ã£o financeira e judicial" },
  { id: "bancario", title: "Direito BancÃ¡rio", desc: "RevisÃ£o de contratos e juros" },
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
    observacoes: "",
    website: "",
  });
  const [success, setSuccess] = useState(false);
  const [slotsApiError, setSlotsApiError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [systemMessage, setSystemMessage] = useState(null);
  const [systemMessageTone, setSystemMessageTone] = useState("error");
  const startedAtRef = React.useRef(Date.now());

  function showSystemMessage(message, tone = "error") {
    setSystemMessage(message);
    setSystemMessageTone(tone);
  }

  function getApiErrorMessage(payload, fallbackMessage) {
    if (!payload || typeof payload !== "object") {
      return fallbackMessage;
    }

    if (payload.stage === "minimum_lead_time" && payload.minimumLeadHours) {
      return `Os agendamentos exigem antecedencia minima de ${payload.minimumLeadHours} horas. Selecione outra data.`;
    }
    if (payload.stage === "supabase_config") {
      return "O sistema de agendamento esta em manutencao. Tente novamente em instantes.";
    }
    if (payload.stage === "supabase_insert") {
      return "Nao foi possivel registrar seu agendamento agora. Tente novamente em instantes.";
    }
    if (payload.stage === "google_calendar_create" || payload.stage === "supabase_update_google_event_id") {
      return "Nao foi possivel reservar este horario agora. Atualize a pagina e tente novamente.";
    }
    if (typeof payload.error === "string" && (payload.error.includes("ocupado") || payload.error.includes("conflito"))) {
      return "Este horario acabou de ficar indisponivel ou ja esta ocupado na agenda. Por favor, escolha outro horario.";
    }

    return fallbackMessage;
  }

  // UtilitÃ¡rio para obter a base da API (Cloudflare/produÃ§Ã£o ou local)
  function getApiBase() {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      // wrangler pages dev usa 8788 por padrÃ£o
      const port = window.location.port || "8788";
      return `http://localhost:${port}/api`;
    }
    return "https://api.hermidamaia.adv.br/api";
  }

  // FunÃ§Ãµes para navegaÃ§Ã£o de mÃªs
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

  // Retorna todos os dias do mÃªs atual para o calendÃ¡rio
  function getDaysInMonth() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    // Preencher dias do mÃªs anterior para alinhar o calendÃ¡rio
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push({ date: new Date(year, month, i - firstDay.getDay() + 1), isPrevMonth: true });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ date: new Date(year, month, d), isPrevMonth: false });
    }
    return days;
  }

  // Retorna horÃ¡rios disponÃ­veis para o dia selecionado
  function getAvailableTimes(date) {
    if (!date) return [];
    const dateStr = formatDateKey(date);
    if (!dateStr) return [];
    return availableSlots[dateStr] || [];
  }
  useEffect(() => {
    const fetchSlots = async () => {
      const apiBase = getApiBase();
      const ano = currentMonth.getFullYear();
      const mes = String(currentMonth.getMonth() + 1).padStart(2, '0');
      try {
        const res = await fetch(`${apiBase}/slots-month?mes=${ano}-${mes}`);
        const data = await res.json();
        if (data && data.ok) {
          setAvailableSlots(data.slots);
          setSlotsApiError(false);
        } else {
          setAvailableSlots({});
          setSlotsApiError(true);
        }
      } catch {
        setAvailableSlots({});
        setSlotsApiError(true);
      }
    };
    fetchSlots();
    // eslint-disable-next-line
  }, [currentMonth]);

  async function handleSubmit() {
    if (!formData.nome || !formData.email) {
      showSystemMessage("Preencha nome e e-mail para continuar.");
      return;
    }
    if (!formData.telefone || !selectedDate || !selectedTime) {
      showSystemMessage("Preencha telefone, data e horario para concluir o agendamento.");
      return;
    }
    setSubmitting(true);
    setSystemMessage(null);
    try {
      const selectedDateKey = formatDateKey(selectedDate);

      // Envia para API de agendamento
      const res = await fetch(`${getApiBase()}/agendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: formData.nome,
          email: formData.email,
          telefone: formData.telefone,
          observacoes: formData.observacoes,
          website: formData.website,
          startedAt: startedAtRef.current,
          area: AREAS.find(a => a.id === selectedArea)?.title,
          data: selectedDateKey,
          hora: selectedTime,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        startedAtRef.current = Date.now();
        setSuccess(true);
      } else {
        showSystemMessage(
          getApiErrorMessage(data, "Nao foi possivel concluir seu agendamento agora. Revise os dados e tente novamente em instantes.")
        );
      }
    } catch {
      showSystemMessage("O sistema de agendamento esta temporariamente indisponivel. Tente novamente em instantes.");
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
      <div className="max-w-6xl mx-auto px-6 pb-20 pt-32">
        <FallbackWarning />
        {systemMessage && (
          <div
            className="mb-6 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: systemMessageTone === "error" ? "#7f1d1d" : "#2D2E2E",
              background: systemMessageTone === "error" ? "rgba(127,29,29,0.25)" : "rgba(0,0,0,0.3)",
              color: "#F4F1EA",
            }}
          >
            {systemMessage}
          </div>
        )}
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



