import type { Answer, Persona, SimEvent } from "../types";
import { aggregate, vividQuotes } from "./aggregate";
import { BATCH_SIZE, isMock, mockAnswer, newStats, progressEvent, runBatches } from "./engine";
import { loadPersonas, personaLine, personaMap } from "./personas";
import { crowdSystem } from "./prompts";
import { chunk, hashStr, mulberry32, shuffle } from "./rng";

// The same n always picks the same people (fixed seed), so runs are comparable.
export function samplePersonas(all: Persona[], n: number): Persona[] {
  if (n >= all.length) return all;
  return shuffle(all, mulberry32(42)).slice(0, n);
}

export async function* runAsk(opts: {
  question: string;
  n: number;
  signal?: AbortSignal;
  origin?: string;
}): AsyncGenerator<SimEvent> {
  const all = await loadPersonas(opts.origin);
  const pmap = await personaMap(opts.origin);
  const people = samplePersonas(all, opts.n);
  // Random batches, never region-sorted: avoids fake within-batch regional effects.
  const order = shuffle(people, mulberry32(hashStr(opts.question)));
  const jobs = chunk(order, BATCH_SIZE).map((b) => ({
    ids: b.map((p) => p.id),
    text: `People:\n${b.map(personaLine).join("\n")}`,
  }));
  const collect = new Map<number, Answer>();
  const stats = newStats();
  yield progressEvent(stats, people.length);
  yield* runBatches({
    system: crowdSystem(opts.question),
    jobs,
    total: people.length,
    signal: opts.signal,
    collect,
    stats,
    mock: isMock() ? (ids) => ids.map((id) => mockAnswer(opts.question, pmap.get(id)!)) : undefined,
  });
  const answers = [...collect.values()];
  yield {
    type: "done",
    ...aggregate(answers, pmap),
    quotes: vividQuotes(answers, pmap),
  };
}
