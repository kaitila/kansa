"use client";
import type { Calibration } from "@/lib/types";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export default function TrustPanel({ cal }: { cal: Calibration | null }) {
  const realRows = (cal?.by_region ?? []).filter((p) => isNum(p.real));
  const done = (cal?.by_region ?? []).filter((p) => isNum(p.real) && isNum(p.synthetic));
  if (cal && realRows.length && done.length < 3) {
    const sorted = [...realRows].sort((a, b) => b.real - a.real);
    return (
      <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] md:p-8">
        <div className="min-h-0">
          <h3 className="mb-2 text-[15px] font-semibold text-snow">Real result: Stubb share by region, February 2024 runoff</h3>
          <ul className="space-y-[5px]">
            {sorted.map((p) => (
              <li key={p.region} className="grid grid-cols-[9rem_1fr_3.2rem] items-center gap-2 text-[14px]">
                <span className="truncate text-frost">{p.region}</span>
                <span className="relative h-3 rounded-[2px] bg-white/[0.06]">
                  <span className="absolute inset-y-0 left-0 rounded-[2px] bg-snow/70" style={{ width: `${p.real}%` }} />
                  <span className="absolute inset-y-[-2px] left-1/2 w-px bg-white/30" />
                </span>
                <span className="text-right tabular-nums text-snow">{p.real.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-center gap-4">
          <h2 className="text-3xl font-semibold leading-tight text-snow md:text-4xl">Can you trust it?</h2>
          <p className="text-lg text-snow">The synthetic re-vote is still running.</p>
          <p className="text-frost">
            Synthetic Finland is re-voting the February 2024 presidential runoff. The real result was Stubb {isNum(cal.national?.real) ? cal.national.real.toFixed(1) : "51.6"}%,
            Haavisto {isNum(cal.national?.real) ? (100 - cal.national.real).toFixed(1) : "48.4"}%. When the run finishes, each region gets its synthetic number next to the real one, with the error stated.
          </p>
          {cal.note && <p className="border-l-2 border-[#f0883e] pl-3 text-snow">{cal.note}</p>}
        </div>
      </div>
    );
  }
  if (!cal || !done.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-2xl text-snow">The calibration run hasn’t finished yet.</p>
        <p className="max-w-lg text-frost">
          Synthetic Finland is re-voting the February 2024 presidential runoff (Stubb vs Haavisto).
          The real result was Stubb 51.6%, Haavisto 48.4%. The region-by-region comparison appears here when the run completes.
        </p>
      </div>
    );
  }
  const pts = done as { region: string; synthetic: number; real: number }[];
  const all = pts.flatMap((p) => [p.synthetic, p.real]);
  const lo = Math.max(0, Math.floor((Math.min(...all) - 3) / 5) * 5);
  const hi = Math.min(100, Math.ceil((Math.max(...all) + 3) / 5) * 5);
  const W = 520, H = 520, m = 48;
  const sx = (v: number) => m + ((v - lo) / (hi - lo)) * (W - 2 * m);
  const sy = (v: number) => H - m - ((v - lo) / (hi - lo)) * (H - 2 * m);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += hi - lo > 30 ? 10 : 5) ticks.push(t);
  const outliers = new Set(
    [...pts].sort((a, b) => Math.abs(b.synthetic - b.real) - Math.abs(a.synthetic - a.real)).slice(0, 3).map((p) => p.region),
  );
  // Place outlier labels without overlap: nudge down when too close to a placed label.
  const labelY = new Map<string, number>();
  const placed: { x: number; y: number }[] = [];
  [...pts].filter((p) => outliers.has(p.region)).sort((a, b) => sy(a.synthetic) - sy(b.synthetic)).forEach((p) => {
    const x = sx(p.real);
    let y = sy(p.synthetic) + 4;
    while (placed.some((q) => Math.abs(q.y - y) < 15 && Math.abs(q.x - x) < 110)) y += 15;
    placed.push({ x, y });
    labelY.set(p.region, y);
  });
  const natSyn = cal.national?.synthetic, natReal = cal.national?.real;
  const natErr = isNum(natSyn) && isNum(natReal) ? natSyn - natReal : null;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] md:p-8">
      <div className="flex min-h-0 items-center justify-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full max-h-[70vh] w-full max-w-[640px]" aria-label="Synthetic vs real Stubb vote share by region">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={sy(lo)} y2={sy(hi)} stroke="rgba(255,255,255,.07)" />
              <line x1={sx(lo)} x2={sx(hi)} y1={sy(t)} y2={sy(t)} stroke="rgba(255,255,255,.07)" />
              <text x={sx(t)} y={H - m + 18} textAnchor="middle" fontSize="12" className="fill-frost">{t}</text>
              <text x={m - 8} y={sy(t) + 4} textAnchor="end" fontSize="12" className="fill-frost">{t}</text>
            </g>
          ))}
          <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke="#eef2f5" strokeOpacity=".5" strokeDasharray="5 5" />
          <text x={sx(hi) - 6} y={sy(hi) + 16} textAnchor="end" fontSize="12" className="fill-frost">perfect match</text>
          <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="13" className="fill-snow">Real Stubb share, % (Statistics Finland)</text>
          <text transform={`translate(14 ${H / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" className="fill-snow">Synthetic Finland, %</text>
          {pts.map((p) => (
            <g key={p.region}>
              <circle cx={sx(p.real)} cy={sy(p.synthetic)} r="6" fill="#22b8a8" fillOpacity=".85" stroke="#0c1726" />
              {outliers.has(p.region) && (
                <text x={sx(p.real) + 9} y={labelY.get(p.region) ?? sy(p.synthetic) + 4} fontSize="12" className="fill-snow">{p.region}</text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-col justify-center gap-6">
        <div>
          <h2 className="text-3xl font-semibold leading-tight text-snow md:text-4xl">Can you trust it?</h2>
          <p className="mt-2 text-frost">
            We had synthetic Finland re-vote the 2024 presidential runoff and compared it with the real result, region by region.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-sm text-frost">Correlation across regions</dt>
            <dd className="text-5xl font-semibold tabular-nums text-snow">r = {isNum(cal.r) ? cal.r.toFixed(2) : "–"}</dd>
          </div>
          <div>
            <dt className="text-sm text-frost">Mean error per region</dt>
            <dd className="text-5xl font-semibold tabular-nums text-snow">{isNum(cal.mae_points) ? `${cal.mae_points.toFixed(1)} pts` : "–"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-sm text-frost">National Stubb share</dt>
            <dd className="text-xl tabular-nums text-snow">
              {natErr != null
                ? `synthetic ${natSyn!.toFixed(1)}% vs real ${natReal!.toFixed(1)}% (${natErr >= 0 ? "+" : ""}${natErr.toFixed(1)} pts)`
                : `real ${isNum(natReal) ? natReal.toFixed(1) : "51.6"}%, synthetic pending`}
            </dd>
          </div>
        </dl>
        {cal.note && <p className="border-l-2 border-[#f0883e] pl-3 text-snow">{cal.note}</p>}
        <p className="text-sm text-frost">
          The model knows who won nationally, so the national number is contaminated. The regional pattern is the real test, because it has to come from the personas.
          {cal.preliminary ? " These numbers are preliminary." : ""}
        </p>
      </div>
    </div>
  );
}
