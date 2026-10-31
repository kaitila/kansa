import { pColor } from "@/lib/client/colors";

export default function Bars({
  rows,
  compact = false,
}: {
  rows: [string, number][];
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "space-y-1" : "space-y-[3px]"}>
      {rows.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[minmax(0,8.5rem)_1fr_2.6rem] items-center gap-2 text-[13px] leading-tight">
          <span className="truncate text-frost">{k}</span>
          <span className="relative h-[9px] rounded-[2px] bg-white/[0.06]">
            <span
              className="absolute inset-y-0 left-0 rounded-[2px] transition-[width,background-color] duration-500"
              style={{ width: `${Math.round(v * 100)}%`, backgroundColor: pColor(v) }}
            />
            <span className="absolute inset-y-[-2px] left-1/2 w-px bg-white/25" />
          </span>
          <span className="text-right tabular-nums text-snow">{Math.round(v * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}
