// Diverging, colour-blind-safe: orange (no) -> slate (unsure) -> teal (yes).
export const C = {
  bg: "#0c1726",
  land: "#132339",
  outline: "#2f4a68",
  snow: "#eef2f5",
  frost: "#8ea3b9",
  no: "#f0883e",
  mid: "#7d8a99",
  yes: "#22b8a8",
  idle: "#5a7190",
};

const NO = [240, 136, 62];
const MID = [125, 138, 153];
const YES = [34, 184, 168];

export function pColor(p: number): string {
  const [r, g, b] = pRGB(p);
  return `rgb(${r},${g},${b})`;
}

export function pRGB(p: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, p));
  const [a, b, u] = t < 0.5 ? [NO, MID, t / 0.5] : [MID, YES, (t - 0.5) / 0.5];
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * u)) as [number, number, number];
}
