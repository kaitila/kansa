/*
 * Precomputed runs ("cached runs") for the demo questions.
 *
 * File: public/cache/<slug>.json, written by `npx tsx scripts/precompute.ts`.
 * <slug> is the DemoQuestion.slug for demo questions (e.g. "car-ban"),
 * otherwise slugify(question).
 *
 *   {
 *     version: 1,
 *     slug, question, n, created_at,
 *     ask:  TimedEvent[],              // events of the n=5000 ask, in order
 *     round1: TimedEvent[],            // talk round 1 (no headline yet)
 *     variants: [                      // rounds 2-3, one branch per headline
 *       { side: "none"|"yes"|"no", headline: string|null,
 *         rounds: [TimedEvent[] /* round 2 *\/, TimedEvent[] /* round 3 *\/] }
 *     ],
 *     narrate?: { bullets: string[] }  // narrator summary for the ask result
 *   }
 *
 * TimedEvent = SimEvent & { t: number }  (ms since that run started)
 *
 * Replay: events are re-emitted with their recorded spacing, compressed so a
 * replay takes at most ~18 s (ask) / ~8 s (talk round). Every replayed event
 * gets cached: true. The progress events keep their recorded calls/tokens/ms,
 * i.e. the stats of the real live run that produced the cache.
 *
 * Talk lookup: round 1 is shared. For round 2 the variant is picked by the
 * request's headline (none / matching text). For round 3 the variant is picked
 * by which variant's round-2 output best matches the states the client sent.
 */
import fs from "fs";
import path from "path";
import type { Answer, SimEvent } from "../types";
import { DEMO_QUESTIONS, slugify } from "../demo";
import { sleep } from "./rng";

export type TimedEvent = SimEvent & { t: number };
export type CacheVariant = { side: "none" | "yes" | "no"; headline: string | null; rounds: TimedEvent[][] };
export type CacheFile = {
  version: 1;
  slug: string;
  question: string;
  n: number;
  created_at: string;
  ask: TimedEvent[];
  round1: TimedEvent[];
  variants: CacheVariant[];
  narrate?: { bullets: string[] };
};

const norm = (q: string) => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function cacheSlug(question: string): string {
  const n = norm(question);
  const demo = DEMO_QUESTIONS.find((d) => norm(d.question) === n);
  return demo ? demo.slug : slugify(question);
}

const mem = new Map<string, CacheFile | null>();

export async function loadCache(question: string, origin?: string): Promise<CacheFile | null> {
  const slug = cacheSlug(question);
  if (!slug) return null;
  if (mem.has(slug)) return mem.get(slug)!;
  let data: CacheFile | null = null;
  const file = path.join(process.cwd(), "public", "cache", `${slug}.json`);
  try {
    if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    data = null;
  }
  if (!data && origin) {
    try {
      const res = await fetch(`${origin}/cache/${slug}.json`, { cache: "no-store" });
      if (res.ok) data = await res.json();
    } catch {
      data = null;
    }
  }
  // Only remember hits; a miss may be fixed by a later deploy/precompute.
  if (data) mem.set(slug, data);
  return data;
}

export async function* replay(
  events: TimedEvent[],
  maxMs: number,
  signal?: AbortSignal,
): AsyncGenerator<SimEvent> {
  const last = events.length ? events[events.length - 1].t : 0;
  const k = last > maxMs ? maxMs / last : 1;
  const start = Date.now();
  for (const ev of events) {
    if (signal?.aborted) return;
    const wait = ev.t * k - (Date.now() - start);
    if (wait > 0) await sleep(wait);
    const { t: _t, ...rest } = ev;
    void _t;
    yield { ...(rest as SimEvent), cached: true } as SimEvent;
  }
}

export function pickTalkEvents(
  c: CacheFile,
  round: number,
  headline: string | null | undefined,
  states: Answer[],
): TimedEvent[] | null {
  if (round <= 1) return c.round1;
  const idx = round - 2;
  if (round === 2) {
    const v = headline
      ? c.variants.find((x) => x.headline === headline) ?? null
      : c.variants.find((x) => x.side === "none") ?? null;
    return v?.rounds[idx] ?? null;
  }
  // round >= 3: choose the variant whose previous round matches the states.
  const sample = states.slice(0, 200);
  let best: CacheVariant | null = null;
  let bestErr = Infinity;
  for (const v of c.variants) {
    const prevRound = v.rounds[idx - 1];
    if (!prevRound || !v.rounds[idx]) continue;
    const m = new Map<number, number>();
    for (const ev of prevRound) if (ev.type === "batch") for (const a of ev.results) m.set(a.id, a.p_yes);
    let err = 0, k = 0;
    for (const s of sample) {
      const p = m.get(s.id);
      if (p === undefined) continue;
      err += Math.abs(p - s.p_yes);
      k++;
    }
    const e = k ? err / k : Infinity;
    if (e < bestErr) {
      bestErr = e;
      best = v;
    }
  }
  return best && bestErr < 0.05 ? best.rounds[idx] : null;
}
