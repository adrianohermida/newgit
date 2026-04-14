import { useInternalTheme } from "../InternalThemeProvider";

export default function ConfirmModal({ open, title, body, confirmLabel = "Confirmar", cancelLabel = "Cancelar", onConfirm, onCancel }) {
  const { isLightTheme } = useInternalTheme();
  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-[80] flex items-center justify-center px-4 backdrop-blur-sm ${isLightTheme ? "bg-[rgba(225,233,240,0.7)]" : "bg-[rgba(3,5,4,0.74)]"}`}>
      <div className={`w-full max-w-md rounded-[28px] border p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F5F8FB)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(12,16,15,0.98),rgba(8,11,10,0.98))]"}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C5A059]">Hermida Maia Advocacia</p>
        <h3 className={`mt-3 text-xl font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{title}</h3>
        <p className={`mt-3 text-sm leading-7 ${isLightTheme ? "text-[#5E707C]" : "text-[#9BAEA8]"}`}>{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={`rounded-full border px-4 py-2 text-sm transition hover:border-[#35554B] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className="rounded-full border border-[#4f2525] bg-[rgba(91,45,45,0.24)] px-4 py-2 text-sm text-[#f2b2b2] transition hover:border-[#f2b2b2]">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
