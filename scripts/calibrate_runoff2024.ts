/**
 * Synthetic Finland re-votes the Feb 2024 presidential runoff (Stubb vs Haavisto),
 * compared with the real result by maakunta (data/runoff2024_real.json, StatFin 14d5).
 *
 * Run: ANTHROPIC_API_KEYS=key1,key2 npx tsx scripts/calibrate_runoff2024.ts [--limit 2000]
 * (or ANTHROPIC_API_KEY, or put either in .env.local)
 * Writes public/data/calibration_runoff2024.json (Calibration type in lib/types.ts).
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import { z } from "zod";
import type { Calibration, Persona } from "../lib/types";

const ROOT = path.resolve(__dirname, "..");
const MODEL = process.env.CROWD_MODEL || "claude-haiku-5-5";
const BATCH = 20;
const CONCURRENCY = Number(process.env.CALIB_CONCURRENCY || 30);

function loadEnvLocal() {
  const f = path.join(ROOT, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const keys = (process.env.ANTHROPIC_API_KEYS || process.env.ANTHROPIC_API_KEY || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!keys.length) {
  console.error("No ANTHROPIC_API_KEYS / ANTHROPIC_API_KEY set. Aborting.");
  process.exit(1);
}
const clients = keys.map((k) => new Anthropic({ apiKey: k, maxRetries: 0 }));
let rr = 0;

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

const personas: Persona[] = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/personas.json"), "utf8"));
const real: Record<string, { stubb_pct: number }> = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data/runoff2024_real.json"), "utf8"),
);

// Personas are aged as of ~2025 data; require 20+ so all were 18+ in Feb 2024.
let voters = personas.filter((p) => p.age >= 20);
// deterministic shuffle so batches mix regions (avoid within-batch regional anchoring)
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
voters = voters
  .map((p) => [rand(), p] as const)
  .sort((a, b) => a[0] - b[0])
  .map((x) => x[1])
  .slice(0, LIMIT);

const QUESTION =
  "In the February 2024 Finnish presidential election runoff between Alexander Stubb and Pekka Haavisto, how likely is it that you voted for Stubb (rather than Haavisto)? Assume you voted.";

const SYSTEM = `You simulate how specific residents of Finland would answer a survey
question. Each person below is sampled from Statistics Finland data:
age, gender, municipality, region, education, main activity, income
decile, language group. Answer as that person would, given their real
life circumstances in their town. People like this disagree with each
other; do not give everyone the same answer, and do not stereotype
beyond what their situation makes plausible.

Question: ${QUESTION}

Return only a JSON array, one object per person, in input order:
{"id": <id>, "p_yes": <0..1 probability they voted Stubb>,
 "quote": "<first person, max 15 words, concrete reason from their life>"}`;

function line(p: Persona) {
  return `#${p.id} | ${p.age} | ${p.gender} | ${p.municipality}, ${p.region} | ${p.activity} | ${p.education} | income decile ${p.income_decile} | ${p.language} | ${p.name}: ${p.blurb}`;
}

const Schema = z.array(z.object({ id: z.coerce.number(), p_yes: z.coerce.number().min(0).max(1), quote: z.string().optional() }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ask(batch: Persona[], attempt = 0): Promise<{ id: number; p_yes: number }[] | null> {
  const client = clients[rr++ % clients.length];
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "People:\n" + batch.map(line).join("\n") }],
    });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    return Schema.parse(JSON.parse(json));
  } catch (e: any) {
    if (attempt >= 2) return null;
    const ra = Number(e?.headers?.["retry-after"] ?? e?.headers?.get?.("retry-after"));
    await sleep(e?.status === 429 ? (ra ? ra * 1000 : 5000) : 500);
    return ask(batch, attempt + 1);
  }
}

function pearson(x: number[], y: number[]) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

async function main() {
  const batches: Persona[][] = [];
  for (let i = 0; i < voters.length; i += BATCH) batches.push(voters.slice(i, i + BATCH));
  const limit = pLimit(CONCURRENCY);
  const byId = new Map(personas.map((p) => [p.id, p]));
  const answers = new Map<number, number>();
  let done = 0, dropped = 0;
  const t0 = Date.now();
  await Promise.all(
    batches.map((b) =>
      limit(async () => {
        const r = await ask(b);
        if (!r) dropped += b.length;
        else for (const a of r) if (byId.has(a.id)) answers.set(a.id, a.p_yes);
        done++;
        if (done % 10 === 0) console.log(`${done}/${batches.length} batches, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }),
    ),
  );

  const agg: Record<string, { s: number; w: number }> = {};
  let ns = 0, nw = 0;
  for (const [id, p] of answers) {
    const per = byId.get(id)!;
    (agg[per.region] ??= { s: 0, w: 0 }).s += p * per.weight;
    agg[per.region].w += per.weight;
    ns += p * per.weight;
    nw += per.weight;
  }
  const by_region = Object.keys(agg)
    .filter((r) => real[r])
    .map((r) => ({ region: r, synthetic: +(100 * agg[r].s / agg[r].w).toFixed(1), real: real[r].stubb_pct }))
    .sort((a, b) => a.region.localeCompare(b.region, "fi"));
  const r = pearson(by_region.map((x) => x.synthetic), by_region.map((x) => x.real));
  const mae = by_region.reduce((a, x) => a + Math.abs(x.synthetic - x.real), 0) / by_region.length;
  const worst = [...by_region].sort((a, b) => Math.abs(b.synthetic - b.real) - Math.abs(a.synthetic - a.real)).slice(0, 3);
  const national = { synthetic: +(100 * ns / nw).toFixed(1), real: (real as any)._national?.stubb_pct ?? 51.6 };

  const out: Calibration = {
    national,
    by_region,
    r: +r.toFixed(2),
    mae_points: +mae.toFixed(1),
    note:
      `Largest errors: ${worst.map((w) => `${w.region} (${w.synthetic} vs ${w.real})`).join(", ")}. ` +
      `${answers.size} synthetic voters (${dropped} dropped), ${MODEL}, unweighted. ` +
      `National number is contaminated (the model knows who won); the regional pattern is the real test.`,
    preliminary: answers.size < 2000,
  };
  fs.writeFileSync(path.join(ROOT, "public/data/calibration_runoff2024.json"), JSON.stringify(out, null, 1));
  console.log(`national synthetic ${national.synthetic} vs real ${national.real}; r=${out.r}; MAE=${out.mae_points} pts`);
  console.log("worst:", worst);
  console.log(`time ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main();
