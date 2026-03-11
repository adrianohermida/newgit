import React from "react";
import { Scale } from "lucide-react";

const GOLD = "#C5A059";
const PARCHMENT = "#F4F1EA";
const GHOST = "#2D2E2E";

export default function AreaStep({ AREAS, selectedArea, setSelectedArea, onContinue }) {
  return (
    <div className="rounded-xl p-8 border" style={{ background: "rgba(45, 46, 46, 0.3)", borderColor: GHOST }}>
      <div className="flex items-center gap-3 mb-8">
        <Scale size={24} style={{ color: GOLD }} />
        <h2 className="text-2xl font-bold" style={{ color: PARCHMENT }}>Selecione a Área de Especialidade</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {AREAS.map((area) => (
          <label
            key={area.id}
            className="relative flex cursor-pointer border p-6 transition-all hover:border-[#C5A059]/50"
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
              <span className="text-base font-bold mb-1" style={{ color: PARCHMENT }}>{area.title}</span>
              <span className="text-sm opacity-60" style={{ color: PARCHMENT }}>{area.desc}</span>
            </div>
          </label>
        ))}
      </div>
      <button
        onClick={onContinue}
        className="w-full py-4 font-bold transition-all hover:opacity-90"
        style={{ background: GOLD, color: "#050706" }}
      >
        Continuar
      </button>
    </div>
  );
}
