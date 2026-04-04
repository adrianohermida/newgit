import React from "react";

export default function TicketModal({ ticket, onClose }) {
  if (!ticket) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 max-w-lg w-full shadow-xl relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-black text-xl"
          aria-label="Fechar detalhes do ticket"
        >
          ×
        </button>
        <h2 className="font-bold text-xl mb-4 text-[#C49C56]">Ticket #{ticket.id}</h2>
        <div className="mb-2 text-sm opacity-70">Status: <span className="font-semibold">{ticket.status}</span></div>
        <div className="mb-2 text-sm opacity-70">Prioridade: <span className="font-semibold">{ticket.priority}</span></div>
        <div className="mb-2 text-sm opacity-70">Atualizado em: <span className="font-semibold">{ticket.updated_at}</span></div>
        <div className="mt-4 mb-2">
          <div className="font-semibold mb-1">Assunto:</div>
          <div>{ticket.subject}</div>
        </div>
        <div className="mt-4 mb-2">
          <div className="font-semibold mb-1">Descrição:</div>
          <div>{ticket.description_text || ticket.description}</div>
        </div>
        {/* Espaço para anexos, comentários, histórico, etc. */}
        {ticket.urls?.ticket_url && (
          <a
            href={ticket.urls.ticket_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-6 rounded-2xl bg-[#C49C56] px-4 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110"
          >
            Abrir atendimento
          </a>
        )}
      </div>
    </div>
  );
}
