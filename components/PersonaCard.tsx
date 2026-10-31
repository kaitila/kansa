import type { Persona } from "@/lib/types";
import { pColor } from "@/lib/client/colors";

export default function PersonaCard({
  persona,
  p,
  quote,
  llm,
  onClose,
}: {
  persona: Persona;
  p?: number;
  quote?: string;
  llm?: boolean;
  onClose: () => void;
}) {
  const g = persona.gender === "F" ? "woman" : persona.gender === "M" ? "man" : "";
  return (
    <div className="pointer-events-auto w-[min(22rem,calc(100%-1.5rem))] rounded-md border border-white/15 bg-[#0e1c2e]/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-snow">
            {persona.name || `Resident #${persona.id}`}, {persona.age}
          </div>
          <div className="text-[13px] text-frost">
            {[g, persona.municipality, persona.region !== persona.municipality ? persona.region : ""].filter(Boolean).join(", ")}
          </div>
        </div>
        <button onClick={onClose} className="rounded px-2 text-xl leading-none text-frost hover:text-snow focus-visible:outline-2 focus-visible:outline-snow" aria-label="Close">
          ×
        </button>
      </div>
      <div className="mt-2 text-[13px] text-frost">
        {[persona.activity, persona.education, `income decile ${persona.income_decile}`, persona.language].filter(Boolean).join(" / ")}
      </div>
      {persona.blurb && <p className="mt-2 text-[13px] italic leading-snug text-frost/90">{persona.blurb}</p>}
      {quote ? (
        <blockquote className="mt-3 border-l-2 pl-3 text-[17px] leading-snug text-snow" style={{ borderColor: p != null ? pColor(p) : undefined }}>
          “{quote}”
        </blockquote>
      ) : (
        <p className="mt-3 text-[13px] text-frost">Hasn’t answered yet. Ask a question.</p>
      )}
      {p != null && (
        <div className="mt-3 text-[13px]">
          <span className="text-frost">Chance of yes </span>
          <span className="font-semibold tabular-nums" style={{ color: pColor(p) }}>{Math.round(p * 100)}%</span>
          {llm === false && <p className="mt-1 text-frost">Last updated by the neighbour rule, not Claude.</p>}
        </div>
      )}
    </div>
  );
}
