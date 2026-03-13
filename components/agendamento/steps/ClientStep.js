import React from "react";
import { User, ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import Input from "../../ui/input";
import Textarea from "../../ui/textarea";

const GOLD = "#C5A059";
const OBSIDIAN = "#050706";
const PARCHMENT = "#F4F1EA";
const GHOST = "#2D2E2E";

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
        <div className="space-y-6 mb-8">
          <div>
            <label className="block text-sm font-bold mb-2 opacity-70" style={{ color: PARCHMENT }}>
              Nome Completo *
            </label>
            <Input
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Seu nome completo"
              style={{ background: "rgba(0,0,0,0.3)", borderColor: GHOST, color: PARCHMENT }}
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2 opacity-70" style={{ color: PARCHMENT }}>
              E-mail *
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="seu@email.com"
              style={{ background: "rgba(0,0,0,0.3)", borderColor: GHOST, color: PARCHMENT }}
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2 opacity-70" style={{ color: PARCHMENT }}>
              Telefone/WhatsApp *
            </label>
            <Input
              type="tel"
              value={formData.telefone}
              onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
              placeholder="(00) 00000-0000"
              style={{ background: "rgba(0,0,0,0.3)", borderColor: GHOST, color: PARCHMENT }}
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2 opacity-70" style={{ color: PARCHMENT }}>
              Observações (opcional)
            </label>
            <Textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Descreva brevemente o motivo da consulta..."
              rows={4}
              style={{ background: "rgba(0,0,0,0.3)", borderColor: GHOST, color: PARCHMENT }}
            />
          </div>
        </div>
        <div className="border-t pt-6 mb-8" style={{ borderColor: GHOST }}>
          <h3 className="font-bold mb-4" style={{ color: GOLD }}>Resumo do Agendamento</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="opacity-70" style={{ color: PARCHMENT }}>Área:</span>
              <span className="font-semibold" style={{ color: PARCHMENT }}>
                {AREAS.find(a => a.id === selectedArea)?.title}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70" style={{ color: PARCHMENT }}>Data:</span>
              <span className="font-semibold" style={{ color: PARCHMENT }}>
                {selectedDate?.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70" style={{ color: PARCHMENT }}>Horário:</span>
              <span className="font-semibold" style={{ color: PARCHMENT }}>{selectedTime}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button
            onClick={onBack}
            className="px-6 py-3 border font-bold transition-all hover:bg-[#2D2E2E]/50"
            style={{ borderColor: GHOST, color: PARCHMENT }}
          >
            <ArrowLeft size={18} className="inline mr-2" />
            Voltar
          </button>
          <button
            onClick={onSubmit}
            disabled={!formData.nome || !formData.email || !formData.telefone || submitting}
            className="flex-1 py-3 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: GOLD, color: OBSIDIAN }}
          >
            {submitting ? "Agendando..." : (
              <>
                <CheckCircle2 size={18} />
                Confirmar Agendamento
              </>
            )}
          </button>
        </div>
        <div className="flex items-center gap-3 mt-6 text-xs opacity-60" style={{ color: PARCHMENT }}>
          <Lock size={14} style={{ color: GOLD }} />
          Seus dados estão protegidos pela LGPD. Cancelamento gratuito até 24h antes.
        </div>
      </div>
    </div>
  );
}
