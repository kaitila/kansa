import type { Aggregates } from "@/lib/types";
import { loadCache } from "@/lib/sim/cache";
import { narrate } from "@/lib/sim/narrate";
import { originOf } from "@/lib/sim/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { question, aggregates, live? } -> { bullets: string[], cached?: boolean }
export async function POST(req: Request) {
  let body: { question?: string; aggregates?: Aggregates; live?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const question = (body.question ?? "").trim().slice(0, 300);
  if (!question || !body.aggregates) return Response.json({ error: "question and aggregates required" }, { status: 400 });
  if (body.live !== true) {
    const c = await loadCache(question, originOf(req));
    // Only reuse the cached narration when it describes the same numbers.
    const askDone = c?.ask.find((e) => e.type === "done") as (Aggregates & { type: "done" }) | undefined;
    if (c?.narrate && askDone && Math.abs(askDone.national - body.aggregates.national) < 0.005) {
      return Response.json({ ...c.narrate, cached: true });
    }
  }
  try {
    return Response.json(await narrate(question, body.aggregates));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
