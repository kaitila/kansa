import type { Calibration, Persona } from "@/lib/types";
import type { FeatureCollection } from "geojson";

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const loadPersonas = () => getJSON<Persona[]>("/data/personas.json");
export const loadRegions = () => getJSON<FeatureCollection>("/data/regions.geojson");
export const loadCalibration = () => getJSON<Calibration>("/data/calibration_runoff2024.json");
