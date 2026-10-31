import type { Persona } from "@/lib/types";

export type LocalAgg = {
  national: number;
  by_region: [string, number][];
  by_age: [string, number][];
  by_income: [string, number][];
  polarisation: number;
  n: number;
};

export function ageBand(a: number): string {
  if (a < 18) return "<18";
  if (a < 30) return "18–29";
  if (a < 45) return "30–44";
  if (a < 65) return "45–64";
  return "65+";
}
export const AGE_ORDER = ["18–29", "30–44", "45–64", "65+"];

export function incomeBand(d: number): string {
  const q = Math.min(5, Math.max(1, Math.ceil(d / 2)));
  return ["Lowest 20%", "2nd", "Middle", "4th", "Top 20%"][q - 1];
}
export const INCOME_ORDER = ["Lowest 20%", "2nd", "Middle", "4th", "Top 20%"];

export function aggregate(personas: Persona[], answers: Map<number, number>): LocalAgg {
  let sw = 0, sp = 0, pol = 0, n = 0;
  const reg = new Map<string, [number, number]>();
  const age = new Map<string, [number, number]>();
  const inc = new Map<string, [number, number]>();
  const add = (m: Map<string, [number, number]>, k: string, w: number, p: number) => {
    const v = m.get(k) || [0, 0];
    v[0] += w; v[1] += w * p; m.set(k, v);
  };
  for (const pe of personas) {
    const p = answers.get(pe.id);
    if (p === undefined) continue;
    const w = pe.weight > 0 ? pe.weight : 1;
    n++; sw += w; sp += w * p;
    if (p < 0.2 || p > 0.8) pol += w;
    add(reg, pe.region, w, p);
    if (pe.age >= 18) add(age, ageBand(pe.age), w, p);
    if (pe.income_decile) add(inc, incomeBand(pe.income_decile), w, p);
  }
  const fin = (m: Map<string, [number, number]>) =>
    [...m.entries()].map(([k, [w, s]]) => [k, w ? s / w : 0] as [string, number]);
  const ageArr = fin(age).sort((a, b) => AGE_ORDER.indexOf(a[0]) - AGE_ORDER.indexOf(b[0]));
  const incArr = fin(inc).sort((a, b) => INCOME_ORDER.indexOf(a[0]) - INCOME_ORDER.indexOf(b[0]));
  return {
    national: sw ? sp / sw : 0,
    by_region: fin(reg).sort((a, b) => b[1] - a[1]),
    by_age: ageArr,
    by_income: incArr,
    polarisation: sw ? pol / sw : 0,
    n,
  };
}

export function toServerAggregates(a: LocalAgg) {
  return {
    national: a.national,
    by_region: Object.fromEntries(a.by_region),
    by_age: Object.fromEntries(a.by_age),
    by_income: Object.fromEntries(a.by_income),
    polarisation: a.polarisation,
    n: a.n,
  };
}
