// Precompute cached demo runs: npx tsx scripts/precompute.ts [slug ...] [--n 5000] [--llm 1000]
// Needs ANTHROPIC_API_KEYS or ANTHROPIC_API_KEY (reads .env.local if present).
// Writes public/cache/<slug>.json (format documented in lib/sim/cache.ts).
import fs from "fs";
import path from "path";
import type { Answer, SimEvent } from "../lib/types";
import { DEMO_QUESTIONS } from "../lib/demo";
import type { CacheFile, CacheVariant, TimedEvent } from "../lib/sim/cache";

function loadEnvLocal() {
  const f = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function record(gen: AsyncGenerator<SimEvent>, label: string): Promise<TimedEvent[]> {
  const start = Date.now();
  const out: TimedEvent[] = [];
  let lastLog = 0;
  for await (const ev of gen) {
    out.push({ ...ev, t: Date.now() - start } as TimedEvent);
    if (ev.type === "progress" && Date.now() - lastLog > 3000) {
      lastLog = Date.now();
      console.log(`  ${label}: ${ev.done}/${ev.total} calls=${ev.calls} dropped=${ev.dropped ?? 0} ${Math.round(ev.ms / 1000)}s`);
    }
    if (ev.type === "error") console.error(`  ${label}: ERROR ${ev.message}`);
  }
  const done = out.find((e) => e.type === "done") as Extract<SimEvent, { type: "done" }> | undefined;
  const prog = [...out].reverse().find((e) => e.type === "progress") as Extract<SimEvent, { type: "progress" }> | undefined;
  console.log(
    `  ${label}: done national=${done ? Math.round(done.national * 100) : "?"}% polar=${done ? Math.round(done.polarisation * 100) : "?"}% calls=${prog?.calls} tok_in=${prog?.tokens_in} tok_out=${prog?.tokens_out} dropped=${prog?.dropped} ${Math.round((prog?.ms ?? 0) / 1000)}s`,
  );
  return out;
}

// Apply a round's batch events on top of the previous states.
function statesAfter(prev: Answer[], events: TimedEvent[]): Answer[] {
  const m = new Map(prev.map((a) => [a.id, { ...a }]));
  for (const ev of events) {
    if (ev.type !== "batch") continue;
    for (const a of ev.results) {
      const cur = m.get(a.id);
      m.set(a.id, { id: a.id, p_yes: a.p_yes, quote: a.quote || cur?.quote || "" });
    }
  }
  return [...m.values()];
}

async function main() {
  loadEnvLocal();
  // Import after env is loaded (engine reads env at call time, but be safe).
  const { runAsk } = await import("../lib/sim/ask");
  const { runTalk } = await import("../lib/sim/talk");
  const { narrate } = await import("../lib/sim/narrate");

  const args = process.argv.slice(2);
  const flag = (k: string, d: number) => {
    const i = args.indexOf(k);
    return i >= 0 ? Number(args[i + 1]) : d;
  };
  const n = flag("--n", 5000);
  const llm = flag("--llm", 1000);
  const slugs = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  const qs = slugs.length ? DEMO_QUESTIONS.filter((d) => slugs.includes(d.slug)) : DEMO_QUESTIONS;
  const outDir = path.join(process.cwd(), "public", "cache");
  fs.mkdirSync(outDir, { recursive: true });

  for (const dq of qs) {
    console.log(`\n== ${dq.slug}: ${dq.question}`);
    const ask = await record(runAsk({ question: dq.question, n }), "ask");
    const s0 = statesAfter([], ask);
    const askDone = ask.find((e) => e.type === "done") as Extract<SimEvent, { type: "done" }> | undefined;

    const round1 = await record(runTalk({ question: dq.question, round: 1, states: s0, llm_n: llm }), "round1");
    const s1 = statesAfter(s0, round1);

    const variants: CacheVariant[] = [];
    const sides: { side: CacheVariant["side"]; headline: string | null }[] = [
      { side: "no", headline: dq.headlines.no },
      { side: "yes", headline: dq.headlines.yes },
      { side: "none", headline: null },
    ];
    for (const v of sides) {
      const r2 = await record(runTalk({ question: dq.question, round: 2, states: s1, headline: v.headline, llm_n: llm }), `r2:${v.side}`);
      const s2 = statesAfter(s1, r2);
      const r3 = await record(runTalk({ question: dq.question, round: 3, states: s2, llm_n: llm }), `r3:${v.side}`);
      variants.push({ ...v, rounds: [r2, r3] });
    }

    let narr: { bullets: string[] } | undefined;
    if (askDone) {
      try {
        narr = await narrate(dq.question, askDone);
        console.log("  narrate:", narr.bullets.join(" | "));
      } catch (e) {
        console.error("  narrate failed:", (e as Error).message);
      }
    }

    const file: CacheFile = {
      version: 1,
      slug: dq.slug,
      question: dq.question,
      n,
      created_at: new Date().toISOString(),
      ask,
      round1,
      variants,
      narrate: narr,
    };
    const p = path.join(outDir, `${dq.slug}.json`);
    fs.writeFileSync(p, JSON.stringify(file));
    console.log(`  wrote ${p} (${Math.round(fs.statSync(p).size / 1024)} KB)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
