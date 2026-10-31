// Social graph: 6 ties per person. 4 inside their own region picked by
// similarity (age band ±10y, same education, same language), 2 random ties
// anywhere in Finland (small-world shortcuts). Seeded, so repeatable.
import type { Persona } from "../types";
import { hashStr, mulberry32 } from "./rng";

export type Graph = Map<number, number[]>;

const cache = new Map<string, Graph>();

export function buildGraph(people: Persona[], seed = 2024): Graph {
  const key = `${seed}:${people.length}:${hashStr(people.map((p) => p.id).join(","))}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rnd = mulberry32(seed);
  const byRegion = new Map<string, Persona[]>();
  for (const p of people) {
    const arr = byRegion.get(p.region) ?? [];
    arr.push(p);
    byRegion.set(p.region, arr);
  }
  const g: Graph = new Map();
  for (const p of people) {
    const local = byRegion.get(p.region)!;
    const cands = new Map<number, number>();
    const tries = Math.min(40, local.length * 2);
    for (let i = 0; i < tries; i++) {
      const c = local[Math.floor(rnd() * local.length)];
      if (c.id === p.id || cands.has(c.id)) continue;
      let s = rnd();
      if (Math.abs(c.age - p.age) <= 10) s += 2;
      if (c.education === p.education) s += 1;
      if (c.language === p.language) s += 1;
      cands.set(c.id, s);
    }
    const ties = [...cands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
    let guard = 0;
    while (ties.length < 6 && guard++ < 50) {
      const c = people[Math.floor(rnd() * people.length)];
      if (c.id !== p.id && !ties.includes(c.id)) ties.push(c.id);
    }
    g.set(p.id, ties);
  }
  cache.set(key, g);
  return g;
}
