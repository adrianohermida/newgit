
import { GOLD, OBSIDIAN, PARCHMENT, GHOST } from "../colors";

export default function ClientStep({
  AREAS,
  selectedArea,
  selectedDate,
  selectedTime,
  formData,
  setFormData,
  onBack,
  onSubmit,
  submitting
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="rounded-xl p-8 border" style={{ background: "rgba(45, 46, 46, 0.3)", borderColor: GHOST }}>
        <div className="flex items-center gap-3 mb-8">
          <User size={24} style={{ color: GOLD }} />
          <h2 className="text-2xl font-bold" style={{ color: PARCHMENT }}>Seus Dados</h2>
        </div>
        <div className="max-w-lg mx-auto mt-6 mb-6">
          <div className="rounded-xl border bg-black/80 p-4 sm:p-8 shadow-lg" style={{ borderColor: GHOST }}>
            <div className="flex items-center gap-3 mb-6 sm:mb-8">
              <User size={24} style={{ color: GOLD }} />
              <h2 className="text-xl sm:text-2xl font-bold" style={{ color: PARCHMENT }}>Seus Dados</h2>
            </div>
            <div className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-2 opacity-70" style={{ color: PARCHMENT }}>
                  Nome Completo *
                </label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Seu nome completo"
                  className="rounded-lg px-3 py-2 sm:py-3 w-full border border-[#2D2E2E] bg-black/30 text-[#F4F1EA] focus:border-[#C5A059] focus:ring-[#C5A059]"
                  style={{ borderColor: GHOST, color: PARCHMENT }}
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-2 opacity-70" style={{ color: PARCHMENT }}>
                  E-mail *
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="seu@email.com"
                  className="rounded-lg px-3 py-2 sm:py-3 w-full border border-[#2D2E2E] bg-black/30 text-[#F4F1EA] focus:border-[#C5A059] focus:ring-[#C5A059]"
                  style={{ borderColor: GHOST, color: PARCHMENT }}
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-2 opacity-70" style={{ color: PARCHMENT }}>
                  Telefone/WhatsApp *
                </label>
                <Input
                  type="tel"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className="rounded-lg px-3 py-2 sm:py-3 w-full border border-[#2D2E2E] bg-black/30 text-[#F4F1EA] focus:border-[#C5A059] focus:ring-[#C5A059]"
                  style={{ borderColor: GHOST, color: PARCHMENT }}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-2 opacity-70" style={{ color: PARCHMENT }}>
                  Observações
                </label>
                <Textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  placeholder="Descreva brevemente sua dúvida ou necessidade"
                  className="rounded-lg px-3 py-2 sm:py-3 w-full border border-[#2D2E2E] bg-black/30 text-[#F4F1EA] focus:border-[#C5A059] focus:ring-[#C5A059]"
                  style={{ borderColor: GHOST, color: PARCHMENT }}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={onBack} className="px-4 py-2 rounded-lg font-bold text-xs sm:text-base bg-black/40 text-[#C5A059] border border-[#C5A059] hover:bg-[#C5A059]/10 transition-all">
                Voltar
              </button>
              <button onClick={onSubmit} disabled={submitting} className="px-4 py-2 rounded-lg font-bold text-xs sm:text-base bg-[#C5A059] text-black hover:opacity-90 transition-all">
                {submitting ? "Enviando..." : "Agendar Consulta"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
