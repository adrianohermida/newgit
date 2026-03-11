import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import AreaStep from "./steps/AreaStep";
import DateStep from "./steps/DateStep";
import ClientStep from "./steps/ClientStep";
import SuccessStep from "./steps/SuccessStep";

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

  useEffect(() => {
    loadAvailableSlots();
    // eslint-disable-next-line
  }, [currentMonth]);

  const loadAvailableSlots = async () => {
    const mockSlots = {};
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
      if (date >= today && date.getDay() !== 0 && date.getDay() !== 6) {
        const dateStr = date.toISOString().split('T')[0];
        mockSlots[dateStr] = ["09:00", "10:30", "14:00", "15:30", "17:00"];
      }
    }
    setAvailableSlots(mockSlots);
  };

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
    setSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setSuccess(true);
    } catch (error) {
      alert("Erro ao realizar agendamento. Tente novamente.");
    }
    setSubmitting(false);
  };

  if (success) {
    return <SuccessStep selectedDate={selectedDate} selectedTime={selectedTime} />;
  }

  return (
    <div style={{ background: "#050706", minHeight: "100vh" }}>
      <div className="max-w-6xl mx-auto px-6 pb-20">
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
