import type { SimEvent } from "@/lib/types";
import { runAsk } from "@/lib/sim/ask";
import { loadCache, replay } from "@/lib/sim/cache";
import { personaMap } from "@/lib/sim/personas";
import { originOf, sseResponse } from "@/lib/sim/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST { question, n, live }  -> SSE stream of SimEvents
// POST ?format=json           -> { done event, quotes: top 2 with name/age/town }
export async function POST(req: Request) {
  let body: { question?: string; n?: number; live?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const question = (body.question ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (question.length < 5) return Response.json({ error: "question too short" }, { status: 400 });
  const n = Math.max(20, Math.min(5000, Math.floor(Number(body.n) || 1000)));
  const origin = originOf(req);
  const asJson = new URL(req.url).searchParams.get("format") === "json";

  const cached = body.live === true ? null : await loadCache(question, origin);
  const gen: AsyncGenerator<SimEvent> = cached
    ? replay(cached.ask, asJson ? 0 : 18_000, req.signal)
    : runAsk({ question, n, signal: req.signal, origin });

  if (asJson) {
    let done: Extract<SimEvent, { type: "done" }> | null = null;
    let error: string | null = null;
    for await (const ev of gen) {
      if (ev.type === "done") done = ev;
      if (ev.type === "error") error = ev.message;
    }
    if (!done) return Response.json({ error: error ?? "no result" }, { status: 502 });
    const pmap = await personaMap(origin);
    const quotes = (done.quotes ?? []).slice(0, 6);
    const yes = quotes.find((q) => q.p_yes >= 0.5);
    const no = quotes.find((q) => q.p_yes < 0.5);
    const two = [yes, no].filter(Boolean).map((q) => {
      const p = pmap.get(q!.id);
      return { ...q!, name: p?.name || q!.name, age: p?.age ?? q!.age, municipality: p?.municipality ?? q!.municipality };
    });
    return Response.json({ ...done, quotes: two, cached: !!cached });
  }
  return sseResponse(gen, req.signal);
}
