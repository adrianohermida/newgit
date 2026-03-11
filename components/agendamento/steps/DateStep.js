import React from "react";
import { Calendar, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";

const GOLD = "#C5A059";
const PARCHMENT = "#F4F1EA";
const GHOST = "#2D2E2E";

export default function DateStep({
  currentMonth,
  handlePrevMonth,
  handleNextMonth,
  getDaysInMonth,
  availableSlots,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  getAvailableTimes,
  onBack,
  onContinue
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <div className="rounded-xl p-8 border" style={{ background: "rgba(45, 46, 46, 0.3)", borderColor: GHOST }}>
          <div className="flex items-center gap-3 mb-8">
            <Calendar size={24} style={{ color: GOLD }} />
            <h2 className="text-2xl font-bold" style={{ color: PARCHMENT }}>Escolha Data e Horário</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Calendar */}
            <div className="border p-4" style={{ borderColor: GHOST, background: "rgba(0,0,0,0.2)" }}>
              <div className="flex items-center justify-between mb-4">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-[#C5A059]/10 rounded-full transition-colors">
                  <ChevronLeft size={20} style={{ color: GOLD }} />
                </button>
                <span className="font-bold" style={{ color: PARCHMENT }}>
                  {currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={handleNextMonth} className="p-2 hover:bg-[#C5A059]/10 rounded-full transition-colors">
                  <ChevronRight size={20} style={{ color: GOLD }} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase mb-2 opacity-50" style={{ color: PARCHMENT }}>
                <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {getDaysInMonth().map((dayObj, i) => {
                  const dateStr = dayObj.date.toISOString().split('T')[0];
                  const hasSlots = availableSlots[dateStr]?.length > 0;
                  const isSelected = selectedDate?.toISOString().split('T')[0] === dateStr;
                  const isPast = dayObj.date < new Date();
                  return (
                    <button
                      key={i}
                      onClick={() => hasSlots && !isPast && setSelectedDate(dayObj.date)}
                      disabled={dayObj.isPrevMonth || !hasSlots || isPast}
                      className="p-2 text-sm transition-all relative"
                      style={{
                        background: isSelected ? GOLD : "transparent",
                        color: isSelected ? "#050706" : dayObj.isPrevMonth || !hasSlots || isPast ? GHOST : PARCHMENT,
                        fontWeight: isSelected ? "bold" : "normal",
                        cursor: dayObj.isPrevMonth || !hasSlots || isPast ? "default" : "pointer",
                        opacity: dayObj.isPrevMonth || isPast ? 0.3 : 1,
                      }}
                    >
                      {dayObj.day}
                      {hasSlots && !isPast && !dayObj.isPrevMonth && (
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: isSelected ? "#050706" : GOLD }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Times */}
            <div className="space-y-4">
              <p className="text-sm font-bold uppercase tracking-wider opacity-60" style={{ color: PARCHMENT }}>
                {selectedDate ? 'Horários Disponíveis' : 'Selecione uma data'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {getAvailableTimes().map((time) => {
                  const isSelected = time === selectedTime;
                  return (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className="py-3 px-3 border text-sm transition-all"
                      style={{
                        background: isSelected ? `${GOLD}20` : "transparent",
                        borderColor: isSelected ? GOLD : GHOST,
                        color: isSelected ? GOLD : PARCHMENT,
                        fontWeight: isSelected ? "bold" : "normal",
                      }}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs italic opacity-50" style={{ color: PARCHMENT }}>
                * Fuso horário: Brasília (GMT-3)
              </p>
            </div>
          </div>
          <div className="flex gap-4 mt-8">
            <button
              onClick={onBack}
              className="px-6 py-3 border font-bold transition-all hover:bg-[#2D2E2E]/50"
              style={{ borderColor: GHOST, color: PARCHMENT }}
            >
              <ArrowLeft size={18} className="inline mr-2" />
              Voltar
            </button>
            <button
              onClick={onContinue}
              disabled={!selectedDate || !selectedTime}
              className="flex-1 py-3 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: GOLD, color: "#050706" }}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
      {/* Sidebar */}
      <div>
        <div className="rounded-xl p-6 border sticky top-8" style={{ background: "rgba(45, 46, 46, 0.3)", borderColor: GHOST }}>
          <div className="text-center mb-6">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/f3535a8df_perfil-home.jpg"
              alt="Dr. Adriano Hermida Maia"
              className="w-24 h-24 rounded-full object-cover border-4 mx-auto mb-4"
              style={{ borderColor: `${GOLD}40` }}
            />
            <h3 className="text-lg font-bold" style={{ color: PARCHMENT }}>Dr. Adriano Hermida Maia</h3>
            <p className="text-xs opacity-60" style={{ color: GOLD }}>OAB/RS 476963</p>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="opacity-70" style={{ color: PARCHMENT }}>Duração</span>
              <span className="font-semibold" style={{ color: PARCHMENT }}>60 min</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70" style={{ color: PARCHMENT }}>Modalidade</span>
              <span className="font-semibold" style={{ color: PARCHMENT }}>Online</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
