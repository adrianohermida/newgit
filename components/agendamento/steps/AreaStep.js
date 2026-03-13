import React from "react";
import { Scale } from "lucide-react";

const GOLD = "#C5A059";
const PARCHMENT = "#F4F1EA";
const GHOST = "#2D2E2E";

export default function AreaStep({ AREAS, selectedArea, setSelectedArea, onContinue }) {
  return (
    <div className="rounded-xl border bg-black/80 max-w-lg mx-auto p-4 sm:p-8 mt-6 mb-6 shadow-lg" style={{ borderColor: GHOST }}>
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <Scale size={24} style={{ color: GOLD }} />
        <h2 className="text-xl sm:text-2xl font-bold" style={{ color: PARCHMENT }}>Selecione a Área de Especialidade</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 mb-6 sm:mb-8">
        {AREAS.map((area) => (
          <label
            key={area.id}
            className="relative flex flex-col cursor-pointer border rounded-lg p-4 sm:p-6 transition-all hover:border-[#C5A059]/50 focus-within:ring-2 focus-within:ring-[#C5A059]"
            style={{
              background: selectedArea === area.id ? "rgba(197, 160, 89, 0.1)" : "transparent",
              borderColor: selectedArea === area.id ? GOLD : GHOST,
              borderWidth: selectedArea === area.id ? "2px" : "1px",
            }}
          >
            <input
              type="radio"
              name="area"
              value={area.id}
              checked={selectedArea === area.id}
              onChange={() => setSelectedArea(area.id)}
              className="sr-only"
            />
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-bold mb-1" style={{ color: PARCHMENT }}>{area.title}</span>
              <span className="text-xs sm:text-sm opacity-60" style={{ color: PARCHMENT }}>{area.desc}</span>
            </div>
          </label>
        ))}
      </div>
      <button
        onClick={onContinue}
        className="w-full py-3 sm:py-4 font-bold rounded-lg transition-all hover:opacity-90 text-sm sm:text-base"
        style={{ background: GOLD, color: "#050706" }}
      >
        Continuar
      </button>
    </div>
  );
}
