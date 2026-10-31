import Anthropic from "@anthropic-ai/sdk";
import type { Aggregates } from "../types";
import { NARRATOR_MODEL, isMock, nextClient } from "./engine";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (m: Record<string, number>) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${pct(v)}`)
    .join(", ");

export async function narrate(question: string, agg: Aggregates): Promise<{ bullets: string[] }> {
  if (isMock()) {
    return {
      bullets: [
        `(mock) Finland lands at ${pct(agg.national)} yes.`,
        "(mock) Region and age explain most of the split.",
        `(mock) ${pct(agg.polarisation)} hold strong views.`,
      ],
    };
  }
  const prompt = `A synthetic, statistically representative sample of ${agg.n} Finns answered:
"${question}"

Results (share saying yes, weighted):
National: ${pct(agg.national)}
By region: ${fmt(agg.by_region)}
By age: ${fmt(agg.by_age)}
By income decile group: ${fmt(agg.by_income)}
Polarised (p<0.2 or p>0.8): ${pct(agg.polarisation)}

Explain in exactly 3 bullets, max 18 words each, why Finland split this way.
Use the numbers. Plain words, no hype. These are simulated people, not a real poll.
Return only JSON: {"bullets": ["...", "...", "..."]}`;

  const client = nextClient();
  const params = {
    model: NARRATOR_MODEL,
    max_tokens: 2000,
    output_config: { effort: "low" as const },
    messages: [{ role: "user" as const, content: prompt }],
  };
  let res: Anthropic.Message;
  try {
    // Server-side refusal fallback (default routing).
    res = (await client.beta.messages.create({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)) as unknown as Anthropic.Message;
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    res = await client.messages.create(params);
  }
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (Array.isArray(j.bullets)) return { bullets: j.bullets.slice(0, 3).map(String) };
    } catch {
      /* fall through */
    }
  }
  const lines = text.split("\n").map((l) => l.replace(/^[-*•\d.\s]+/, "").trim()).filter(Boolean);
  return { bullets: lines.slice(0, 3) };
}
