import type { Aggregates, Answer, Persona } from "../types";

export function ageBand(age: number): string {
  if (age < 30) return "18-29";
  if (age < 45) return "30-44";
  if (age < 65) return "45-64";
  return "65+";
}

export function incomeBand(d: number): string {
  if (d <= 3) return "1-3";
  if (d <= 7) return "4-7";
  return "8-10";
}

// Weighted aggregates (persona.weight = post-stratification weight, 1 if unknown).
export function aggregate(answers: Iterable<Answer>, personas: Map<number, Persona>): Aggregates {
  const acc = (m: Map<string, [number, number]>, k: string, w: number, p: number) => {
    const cur = m.get(k) ?? [0, 0];
    cur[0] += w * p;
    cur[1] += w;
    m.set(k, cur);
  };
  const region = new Map<string, [number, number]>();
  const age = new Map<string, [number, number]>();
  const income = new Map<string, [number, number]>();
  let sw = 0, swp = 0, spol = 0, n = 0;
  for (const a of answers) {
    const p = personas.get(a.id);
    if (!p) continue;
    const w = p.weight > 0 ? p.weight : 1;
    sw += w;
    swp += w * a.p_yes;
    if (a.p_yes < 0.2 || a.p_yes > 0.8) spol += w;
    n++;
    acc(region, p.region, w, a.p_yes);
    acc(age, ageBand(p.age), w, a.p_yes);
    acc(income, incomeBand(p.income_decile), w, a.p_yes);
  }
  const fin = (m: Map<string, [number, number]>) =>
    Object.fromEntries([...m.entries()].map(([k, [x, w]]) => [k, w ? x / w : 0]));
  return {
    national: sw ? swp / sw : 0,
    by_region: fin(region),
    by_age: fin(age),
    by_income: fin(income),
    polarisation: sw ? spol / sw : 0,
    n,
  };
}

// Pick vivid quotes: strong opinions, longer concrete quotes, spread over regions.
export function vividQuotes(answers: Answer[], personas: Map<number, Persona>, k = 6) {
  const scored = answers
    .filter((a) => a.quote && a.quote.length > 12)
    .map((a) => ({ a, s: Math.abs(a.p_yes - 0.5) * 2 + Math.min(a.quote.length, 90) / 90 }))
    .sort((x, y) => y.s - x.s);
  const out: (Answer & { name?: string; age?: number; municipality?: string })[] = [];
  const seenRegion = new Set<string>();
  let yes = 0, no = 0;
  for (const { a } of scored) {
    const p = personas.get(a.id);
    if (!p || seenRegion.has(p.region)) continue;
    // keep both sides represented
    if (a.p_yes >= 0.5 && yes >= Math.ceil(k / 2)) continue;
    if (a.p_yes < 0.5 && no >= Math.ceil(k / 2)) continue;
    if (a.p_yes >= 0.5) yes++;
    else no++;
    seenRegion.add(p.region);
    out.push({ ...a, name: p.name || undefined, age: p.age, municipality: p.municipality });
    if (out.length >= k) break;
  }
  return out;
}
