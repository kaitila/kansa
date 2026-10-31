// One "let them talk" round. A random subset (llm_n, default 1000) is updated
// by Claude after hearing three neighbours (and, for ~40% most exposed, a
// headline). Everyone else is updated with the Hegselmann–Krause rule.
// LLM-updated answers carry llm:true; rule-updated ones carry llm:false and an
// empty quote (keep the previous quote on the client).
import type { Answer, Persona, SimEvent } from "../types";
import { aggregate, vividQuotes } from "./aggregate";
import { BATCH_SIZE, isMock, mockAnswer, newStats, progressEvent, runBatches } from "./engine";
import { buildGraph } from "./graph";
import { hkUpdate } from "./hk";
import { personaLine, personaMap } from "./personas";
import { talkSystem } from "./prompts";
import { chunk, hashStr, mulberry32, shuffle } from "./rng";

const r2 = (x: number) => Math.round(x * 100) / 100;

export async function* runTalk(opts: {
  question: string;
  round: number;
  states: Answer[];
  headline?: string | null;
  llm_n?: number;
  signal?: AbortSignal;
  origin?: string;
}): AsyncGenerator<SimEvent> {
  const pmap = await personaMap(opts.origin);
  const people: Persona[] = opts.states
    .map((s) => pmap.get(s.id))
    .filter((p): p is Persona => !!p)
    .sort((a, b) => a.id - b.id);
  const prev = new Map(opts.states.map((s) => [s.id, s.p_yes]));
  const prevQuote = new Map(opts.states.map((s) => [s.id, s.quote ?? ""]));
  const graph = buildGraph(people);
  const rnd = mulberry32(hashStr(opts.question) + opts.round * 7919);

  const llmN = Math.min(
    opts.llm_n ?? (Number(process.env.KANSA_TALK_LLM_N) || 1000),
    people.length,
  );
  const llmPeople = shuffle(people, rnd).slice(0, llmN);
  const llmIds = new Set(llmPeople.map((p) => p.id));

  // Headline reaches the 40% most exposed: random, weighted toward older people.
  const exposed = new Set<number>();
  if (opts.headline) {
    const scored = people.map((p) => ({ id: p.id, s: rnd() * (0.5 + p.age / 80) }));
    scored.sort((a, b) => b.s - a.s);
    for (const x of scored.slice(0, Math.round(people.length * 0.4))) exposed.add(x.id);
  }

  const hk = hkUpdate(people.map((p) => p.id), prev, graph);
  const stats = newStats();
  const total = people.length;

  // Rule-updated people first: instant.
  const ruleIds = people.filter((p) => !llmIds.has(p.id)).map((p) => p.id);
  for (const c of chunk(ruleIds, 1000)) {
    yield { type: "batch", results: c.map((id) => ({ id, p_yes: r2(hk.get(id)!), quote: "", llm: false })) };
  }
  stats.done = ruleIds.length;
  yield progressEvent(stats, total);

  const lineFor = (p: Persona) => {
    const ns = shuffle(graph.get(p.id) ?? [], rnd).slice(0, 3);
    const heard = ns
      .map((j) => {
        const q = pmap.get(j);
        if (!q) return "";
        const who = `${q.name || "someone"}, ${q.age}, ${q.municipality}`;
        return `${who}: p=${r2(prev.get(j) ?? 0.5)} "${prevQuote.get(j) || "(no comment)"}"`;
      })
      .filter(Boolean)
      .join("; ");
    return `${personaLine(p)}${exposed.has(p.id) ? " [saw headline]" : ""}\n  before: p=${r2(prev.get(p.id) ?? 0.5)} "${prevQuote.get(p.id) || ""}"\n  heard: ${heard}`;
  };

  const order = shuffle(llmPeople, rnd);
  const jobs = chunk(order, BATCH_SIZE).map((b) => ({
    ids: b.map((p) => p.id),
    text: `People:\n${b.map(lineFor).join("\n")}`,
  }));

  const collect = new Map<number, Answer>();
  const dropped: number[] = [];
  const mockQ = `${opts.question}#${opts.round}#${opts.headline ?? ""}`;
  for await (const ev of runBatches({
    system: talkSystem(opts.question, opts.headline),
    jobs,
    total,
    signal: opts.signal,
    collect,
    stats,
    maxTokens: 3500,
    onDrop: (ids) => dropped.push(...ids),
    mock: isMock()
      ? (ids) =>
          ids.map((id) => {
            const p = pmap.get(id)!;
            const a = mockAnswer(mockQ, p, prev.get(id));
            if (exposed.has(id)) a.p_yes = r2(Math.min(1, Math.max(0, a.p_yes + (a.p_yes < 0.5 ? -0.15 : 0.15))));
            return a;
          })
      : undefined,
  })) {
    if (ev.type === "batch") yield { ...ev, results: ev.results.map((a) => ({ ...a, llm: true })) };
    else yield ev;
  }
  if (dropped.length) {
    yield { type: "batch", results: dropped.map((id) => ({ id, p_yes: r2(hk.get(id) ?? prev.get(id) ?? 0.5), quote: "", llm: false })) };
  }

  const merged = new Map<number, Answer>();
  for (const p of people) merged.set(p.id, { id: p.id, p_yes: hk.get(p.id) ?? prev.get(p.id)!, quote: prevQuote.get(p.id) ?? "" });
  for (const [id, a] of collect) merged.set(id, { ...a, llm: true });
  yield {
    type: "done",
    ...aggregate(merged.values(), pmap),
    quotes: vividQuotes([...collect.values()], pmap),
  };
}
