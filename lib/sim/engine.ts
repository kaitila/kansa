// Claude fan-out engine. One call answers for a batch of ~20 people; many calls
// run in parallel across a pool of API keys. Results stream back as SimEvents.
import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import { z } from "zod";
import type { Answer, SimEvent } from "../types";
import { hashStr, mulberry32, sleep } from "./rng";

export const CROWD_MODEL = process.env.KANSA_CROWD_MODEL || "claude-haiku-5-5";
export const NARRATOR_MODEL = process.env.KANSA_NARRATOR_MODEL || "claude-sonnet-5-5";
export const BATCH_SIZE = 20;

export const isMock = () => process.env.KANSA_MOCK === "1";

let clients: Anthropic[] | null = null;
let rr = 0;

export function apiKeys(): string[] {
  return (process.env.ANTHROPIC_API_KEYS || process.env.ANTHROPIC_API_KEY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Round-robin over every key we have. maxRetries: 1 makes the SDK honour
// retry-after on 429/529 and retry exactly once.
export function nextClient(): Anthropic {
  if (!clients) clients = apiKeys().map((apiKey) => new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 }));
  if (!clients.length) throw new Error("No ANTHROPIC_API_KEYS / ANTHROPIC_API_KEY configured");
  return clients[rr++ % clients.length];
}

const Item = z.object({
  id: z.coerce.number().int(),
  p_yes: z.coerce.number().refine((x) => Number.isFinite(x)),
  quote: z.string().optional().default(""),
});

const clamp = (x: number) => Math.min(1, Math.max(0, x > 1 && x <= 100 ? x / 100 : x));
const trimQuote = (q: string) => {
  const s = q.replace(/\s+/g, " ").trim().replace(/^["“]|["”]$/g, "");
  return s.length > 140 ? s.slice(0, 137) + "…" : s;
};

// Parse a model reply into answers. Lenient per item, strict on coverage:
// if fewer than 80% of the batch came back valid, treat the batch as bad.
export function parseAnswers(text: string, ids: number[]): Answer[] | null {
  const s = text.indexOf("[");
  const e = text.lastIndexOf("]");
  if (s < 0 || e <= s) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const want = new Set(ids);
  const seen = new Set<number>();
  const out: Answer[] = [];
  for (const r of raw) {
    const v = Item.safeParse(r);
    if (!v.success || !want.has(v.data.id) || seen.has(v.data.id)) continue;
    seen.add(v.data.id);
    out.push({ id: v.data.id, p_yes: clamp(v.data.p_yes), quote: trimQuote(v.data.quote) });
  }
  return out.length >= Math.ceil(ids.length * 0.8) ? out : null;
}

export type BatchJob = { ids: number[]; text: string };

export type Stats = {
  calls: number;
  tokens_in: number;
  tokens_out: number;
  dropped: number;
  done: number;
  start: number;
};

export type RunOpts = {
  system: Anthropic.TextBlockParam[];
  jobs: BatchJob[];
  total: number;
  signal?: AbortSignal;
  /** Collects every successful answer, keyed by id. */
  collect: Map<number, Answer>;
  /** Called on dropped ids (after retry). */
  onDrop?: (ids: number[]) => void;
  /** Mock answer function for KANSA_MOCK=1. */
  mock?: (ids: number[]) => Answer[];
  stats?: Stats;
  maxTokens?: number;
};

export function newStats(): Stats {
  return { calls: 0, tokens_in: 0, tokens_out: 0, dropped: 0, done: 0, start: Date.now() };
}

export function progressEvent(st: Stats, total: number): SimEvent {
  const ev = {
    type: "progress" as const,
    done: st.done,
    total,
    calls: st.calls,
    tokens_in: st.tokens_in,
    tokens_out: st.tokens_out,
    ms: Date.now() - st.start,
    dropped: st.dropped,
    ...(isMock() ? { mock: true } : {}),
  };
  return ev;
}

class Queue<T> {
  private items: T[] = [];
  private waiters: ((v: T) => void)[] = [];
  push(v: T) {
    const w = this.waiters.shift();
    if (w) w(v);
    else this.items.push(v);
  }
  next(): Promise<T> {
    const v = this.items.shift();
    if (v !== undefined) return Promise.resolve(v);
    return new Promise((r) => this.waiters.push(r));
  }
}

async function callBatch(opts: RunOpts, job: BatchJob, st: Stats): Promise<Answer[] | null> {
  if (opts.mock) {
    await sleep(250 + (hashStr(job.text) % 900));
    st.calls++;
    st.tokens_in += 900 + Math.round(job.text.length / 4);
    st.tokens_out += job.ids.length * 32;
    return opts.mock(job.ids);
  }
  const client = nextClient();
  st.calls++;
  const res = await client.messages.create(
    {
      model: CROWD_MODEL,
      max_tokens: opts.maxTokens ?? 3000,
      // Haiku 5.5 thinks by default; this is a fast survey task, so turn it off.
      thinking: { type: "disabled" },
      system: opts.system,
      messages: [{ role: "user", content: job.text }],
    },
    { signal: opts.signal },
  );
  const u = res.usage;
  st.tokens_in += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  st.tokens_out += u.output_tokens ?? 0;
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return parseAnswers(text, job.ids);
}

const FATAL = (e: unknown) =>
  e instanceof Anthropic.AuthenticationError ||
  e instanceof Anthropic.PermissionDeniedError ||
  e instanceof Anthropic.NotFoundError ||
  (e instanceof Anthropic.BadRequestError && !/overloaded|too long/i.test(String((e as Error).message)));

/**
 * Runs all jobs with a concurrency pool and yields batch + progress events as
 * each batch lands. Never throws for a single bad batch: it retries once, then
 * drops and counts. A fatal API error (bad key, bad request) yields one error
 * event and stops scheduling new work.
 */
export async function* runBatches(opts: RunOpts): AsyncGenerator<SimEvent> {
  const st = opts.stats ?? newStats();
  const limit = pLimit(Number(process.env.KANSA_CONCURRENCY) || 50);
  const q = new Queue<SimEvent | null>();
  let pending = opts.jobs.length;
  let fatal: string | null = null;

  for (const job of opts.jobs) {
    limit(async () => {
      let answers: Answer[] | null = null;
      for (let attempt = 0; attempt < 2 && !answers; attempt++) {
        if (fatal || opts.signal?.aborted) break;
        try {
          answers = await callBatch(opts, job, st);
        } catch (e) {
          if (FATAL(e) && !fatal) {
            fatal = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 300);
            q.push({ type: "error", message: fatal });
          }
          if (opts.signal?.aborted) break;
        }
      }
      if (answers) {
        for (const a of answers) opts.collect.set(a.id, a);
        st.done += answers.length;
        const missing = job.ids.filter((id) => !answers!.some((a) => a.id === id));
        if (missing.length) {
          st.dropped += missing.length;
          st.done += missing.length;
          opts.onDrop?.(missing);
        }
        q.push({ type: "batch", results: answers });
      } else {
        st.dropped += job.ids.length;
        st.done += job.ids.length;
        opts.onDrop?.(job.ids);
      }
      q.push(progressEvent(st, opts.total));
    }).finally(() => {
      pending--;
      if (pending === 0) q.push(null);
    });
  }
  if (pending === 0) return;
  while (true) {
    const ev = await q.next();
    if (ev === null) break;
    yield ev;
  }
}

// ---- Mock answers (KANSA_MOCK=1, UI dev only) ----

export function mockAnswer(
  question: string,
  p: { id: number; age: number; region: string; income_decile: number; municipality: string; activity: string },
  prev?: number,
): Answer {
  const qh = hashStr(question);
  const rnd = mulberry32(qh ^ (p.id * 2654435761));
  const base = ((qh % 60) + 20) / 100;
  const ageEff = ((qh >> 3) % 2 ? 1 : -1) * (p.age - 45) / 60;
  const regEff = (((hashStr(p.region) ^ qh) % 100) / 100 - 0.5) * 0.8;
  const incEff = ((qh >> 5) % 2 ? 1 : -1) * (p.income_decile - 5.5) / 12;
  const logit = Math.log(base / (1 - base)) + ageEff + regEff + incEff + (rnd() - 0.5) * 2.2;
  let pp = 1 / (1 + Math.exp(-logit));
  if (prev !== undefined) pp = prev + (pp - prev) * 0.35;
  const pyes = Math.round(pp * 100) / 100;
  const quote = `(mock) As a ${p.age}-year-old ${p.activity} in ${p.municipality}, I'd say ${pyes >= 0.5 ? "yes" : "no"}.`;
  return { id: p.id, p_yes: pyes, quote };
}
