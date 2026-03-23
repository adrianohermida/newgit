import { useEffect, useState } from "react";
import Head from "next/head";
import { formatDateKey } from "../components/agendamento/dateUtils";

export default function Remarcar() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("loading");
  const [mensagem, setMensagem] = useState("");
  const [agendamento, setAgendamento] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availableSlots, setAvailableSlots] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const currentToken = new URLSearchParams(window.location.search).get("token") || "";
    setToken(currentToken);
    if (!currentToken) {
      setStatus("erro");
      setMensagem("Token de remarcação ausente.");
      return;
    }

    fetch(`/api/remarcar?token=${encodeURIComponent(currentToken)}&mode=json`, {
      headers: { Accept: "application/json" },
    })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok || !data?.ok) {
          setStatus(data?.status || "erro");
          setMensagem(data?.message || "Nao foi possivel carregar a remarcação.");
        } else {
          setStatus("pronto_para_remarcar");
          setMensagem(data.message || "Escolha um novo horário.");
          setAgendamento(data.agendamento || null);
        }
      })
      .catch(() => {
        setStatus("erro");
        setMensagem("Nao foi possivel carregar a remarcação.");
      });
  }, []);

  useEffect(() => {
    const ano = currentMonth.getFullYear();
    const mes = String(currentMonth.getMonth() + 1).padStart(2, "0");
    fetch(`/api/slots-month?mes=${ano}-${mes}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) {
          setAvailableSlots(data.slots || {});
        }
      })
      .catch(() => {});
  }, [currentMonth]);

  function getDaysInMonth() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i += 1) {
      days.push({ date: new Date(year, month, i - firstDay.getDay() + 1), isPrevMonth: true });
    }
    for (let d = 1; d <= lastDay.getDate(); d += 1) {
      days.push({ date: new Date(year, month, d), isPrevMonth: false });
    }
    return days;
  }

  function getAvailableTimes(date) {
    if (!date) return [];
    return availableSlots[formatDateKey(date)] || [];
  }

  async function handleSubmit() {
    if (!selectedDate || !selectedTime) {
      setMensagem("Selecione uma nova data e um novo horário.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/remarcar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          token,
          data: formatDateKey(selectedDate),
          hora: selectedTime,
        }),
      });
      const data = await res.json().catch(() => null);
      setStatus(data?.status || (res.ok ? "remarcado" : "erro"));
      setMensagem(data?.message || (res.ok ? "Agendamento remarcado com sucesso." : "Erro ao remarcar."));
    } catch {
      setStatus("erro");
      setMensagem("Erro ao remarcar agendamento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Remarcação de Agendamento | Hermida Maia</title>
      </Head>
      <div className="min-h-screen bg-[#050706] text-[#F4F1EA] px-4 py-10">
        <div className="max-w-4xl mx-auto rounded-xl border bg-black/80 p-8 shadow-lg" style={{ borderColor: "#C5A059" }}>
          <h1 className="text-2xl font-bold mb-4 text-center" style={{ color: "#C5A059" }}>
            {status === "remarcado" ? "Agendamento Remarcado" : "Remarcar Agendamento"}
          </h1>
          <p className="text-center text-lg opacity-80 mb-6">{mensagem}</p>

          {agendamento && status === "pronto_para_remarcar" && (
            <div className="text-sm rounded-lg border border-[#2D2E2E] bg-black/40 p-4 mb-8">
              <p><strong>Agendamento atual:</strong> {agendamento.dataFormatada} às {agendamento.hora}</p>
              <p><strong>Área:</strong> {agendamento.area}</p>
            </div>
          )}

          {status === "pronto_para_remarcar" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>Anterior</button>
                <strong>{currentMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong>
                <button onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>Próximo</button>
              </div>
              <div className="grid grid-cols-7 gap-2 mb-6">
                {getDaysInMonth().map((dayObj, index) => {
                  const key = formatDateKey(dayObj.date);
                  const hasSlots = (availableSlots[key] || []).length > 0;
                  return (
                    <button
                      key={`${key}-${index}`}
                      disabled={dayObj.isPrevMonth || !hasSlots}
                      onClick={() => setSelectedDate(dayObj.date)}
                      className="rounded-lg border px-2 py-3 text-sm disabled:opacity-30"
                      style={{
                        borderColor: selectedDate && formatDateKey(selectedDate) === key ? "#C5A059" : "#2D2E2E",
                        background: selectedDate && formatDateKey(selectedDate) === key ? "rgba(197,160,89,0.2)" : "transparent",
                      }}
                    >
                      {dayObj.date.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                {getAvailableTimes(selectedDate).map((time) => (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    className="rounded-lg border px-3 py-2"
                    style={{
                      borderColor: selectedTime === time ? "#C5A059" : "#2D2E2E",
                      background: selectedTime === time ? "#C5A059" : "transparent",
                      color: selectedTime === time ? "#050706" : "#F4F1EA",
                    }}
                  >
                    {time}
                  </button>
                ))}
              </div>
              <div className="text-center">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-block px-6 py-3 rounded-lg font-semibold bg-[#C5A059] text-[#050706] hover:opacity-90 transition-all disabled:opacity-60"
                >
                  {submitting ? "Remarcando..." : "Confirmar remarcação"}
                </button>
              </div>
            </>
          )}

          {status !== "pronto_para_remarcar" && (
            <div className="text-center">
              <a href="/" className="inline-block mt-4 px-6 py-3 rounded-lg font-semibold bg-[#C5A059] text-[#050706] hover:opacity-90 transition-all">
                Voltar ao início
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
