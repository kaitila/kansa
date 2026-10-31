import { pColor } from "@/lib/client/colors";

export default function Sparkline({ values, width = 160, height = 44 }: { values: number[]; width?: number; height?: number }) {
  const slots = 4;
  const pad = 12;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (slots - 1);
  const y = (v: number) => height - pad - v * (height - 2 * pad);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="National support by round">
      <line x1={pad} x2={width - pad} y1={y(0.5)} y2={y(0.5)} stroke="rgba(255,255,255,.18)" strokeDasharray="2 3" />
      {Array.from({ length: slots }, (_, i) => (
        <text key={i} x={x(i)} y={height} textAnchor="middle" className="fill-frost" fontSize="9">
          {i === 0 ? "poll" : `R${i}`}
        </text>
      ))}
      {values.length > 1 && <polyline points={pts} fill="none" stroke="#eef2f5" strokeWidth="1.5" />}
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="3.2" fill={pColor(v)} stroke="#0c1726" strokeWidth="1" />
      ))}
    </svg>
  );
}
