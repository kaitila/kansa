// Server-side persona loading. Reads public/data/personas.json from disk,
// falls back to fetching it from the deployment's own origin (Vercel may not
// ship public/ inside the function bundle), and only in dev/mock mode falls
// back to a small generated fixture.
import fs from "fs";
import path from "path";
import type { Persona } from "../types";
import { mulberry32 } from "./rng";

let cache: Persona[] | null = null;
let byId: Map<number, Persona> | null = null;

export async function loadPersonas(origin?: string): Promise<Persona[]> {
  if (cache) return cache;
  const file = path.join(process.cwd(), "public", "data", "personas.json");
  let data: Persona[] | null = null;
  try {
    if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    data = null;
  }
  if (!data && origin) {
    try {
      const res = await fetch(`${origin}/data/personas.json`, { cache: "no-store" });
      if (res.ok) data = await res.json();
    } catch {
      data = null;
    }
  }
  if (!data) {
    if (process.env.NODE_ENV === "production" && process.env.KANSA_MOCK !== "1") {
      throw new Error("public/data/personas.json not found");
    }
    console.warn("[kansa] personas.json missing, using dev fixture");
    data = fixturePersonas(600);
  }
  cache = data;
  byId = new Map(data.map((p) => [p.id, p]));
  return data;
}

export async function personaMap(origin?: string): Promise<Map<number, Persona>> {
  if (!byId) await loadPersonas(origin);
  return byId!;
}

// Dev-only fixture. Not used in the demo.
const REGIONS: [string, number, number, string][] = [
  ["Uusimaa", 60.25, 24.9, "Helsinki"],
  ["Varsinais-Suomi", 60.6, 22.4, "Turku"],
  ["Pirkanmaa", 61.6, 23.8, "Tampere"],
  ["Pohjois-Savo", 62.9, 27.6, "Kuopio"],
  ["Pohjanmaa", 63.1, 21.6, "Vaasa"],
  ["Pohjois-Pohjanmaa", 65.0, 25.5, "Oulu"],
  ["Lappi", 67.5, 26.0, "Rovaniemi"],
  ["Keski-Suomi", 62.4, 25.7, "Jyväskylä"],
];
const EDU = ["basic", "upper secondary", "vocational", "bachelor", "master+"];
const ACT = ["employed", "employed", "employed", "pensioner", "student", "unemployed"];
const NAMES_F = ["Pirkko", "Aino", "Sanna", "Laura", "Marja", "Emilia"];
const NAMES_M = ["Matti", "Juha", "Mikko", "Onni", "Jari", "Elias"];

export function fixturePersonas(n: number): Persona[] {
  const rnd = mulberry32(7);
  return Array.from({ length: n }, (_, i) => {
    const [region, lat, lon, town] = REGIONS[Math.floor(rnd() * REGIONS.length)];
    const age = 18 + Math.floor(rnd() * 70);
    const gender = rnd() < 0.5 ? "F" : "M";
    const activity = age > 66 ? "pensioner" : age < 24 && rnd() < 0.5 ? "student" : ACT[Math.floor(rnd() * 4)];
    const names = gender === "F" ? NAMES_F : NAMES_M;
    return {
      id: i + 1,
      age,
      gender,
      municipality: town,
      region,
      lat: lat + (rnd() - 0.5) * 0.6,
      lon: lon + (rnd() - 0.5) * 1.0,
      education: EDU[Math.floor(rnd() * EDU.length)],
      activity,
      income_decile: 1 + Math.floor(rnd() * 10),
      language: region === "Pohjanmaa" && rnd() < 0.5 ? "Swedish" : "Finnish",
      name: names[Math.floor(rnd() * names.length)],
      blurb: "",
      weight: 1,
    } satisfies Persona;
  });
}

export function personaLine(p: Persona): string {
  const g = p.gender === "F" ? "F" : "M";
  const who = p.name ? `${p.name}${p.blurb ? `: ${p.blurb}` : ""}` : "";
  return [
    `#${p.id}`,
    p.age,
    g,
    `${p.municipality}, ${p.region}`,
    p.activity,
    p.education,
    `income decile ${p.income_decile}`,
    p.language,
    who,
  ]
    .filter((x) => x !== "")
    .join(" | ");
}
