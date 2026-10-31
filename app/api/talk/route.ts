import type { Answer, SimEvent } from "@/lib/types";
import { loadCache, pickTalkEvents, replay } from "@/lib/sim/cache";
import { runTalk } from "@/lib/sim/talk";
import { originOf, sseResponse } from "@/lib/sim/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST { question, round (1-based), states, headline?, llm_n?, live? } -> SSE
// Send the headline only on the round it should hit (the demo uses round 2).
export async function POST(req: Request) {
  let body: { question?: string; round?: number; states?: Answer[]; headline?: string | null; llm_n?: number; live?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const question = (body.question ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const states = Array.isArray(body.states) ? body.states.filter((s) => s && typeof s.id === "number") : [];
  if (!question || !states.length) return Response.json({ error: "question and states required" }, { status: 400 });
  const round = Math.max(1, Math.floor(Number(body.round) || 1));
  const headline = body.headline ? String(body.headline).slice(0, 200) : null;
  const origin = originOf(req);

  let gen: AsyncGenerator<SimEvent> | null = null;
  if (body.live !== true) {
    const c = await loadCache(question, origin);
    const evs = c ? pickTalkEvents(c, round, headline, states) : null;
    if (evs) gen = replay(evs, 8_000, req.signal);
  }
  gen ??= runTalk({
    question,
    round,
    states,
    headline,
    llm_n: body.llm_n ? Math.max(0, Math.min(5000, Math.floor(body.llm_n))) : undefined,
    signal: req.signal,
    origin,
  });
  return sseResponse(gen, req.signal);
}
