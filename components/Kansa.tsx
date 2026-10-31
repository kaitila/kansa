"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { Answer, Calibration, Persona } from "@/lib/types";
import { DEMO_QUESTIONS } from "@/lib/demo";
import { postSSE, type AnyEvent } from "@/lib/client/sse";
import { aggregate, toServerAggregates } from "@/lib/client/agg";
import { loadCalibration, loadPersonas, loadRegions } from "@/lib/client/data";
import { pColor } from "@/lib/client/colors";
import FinlandMap from "./FinlandMap";
import Bars from "./Bars";
import Sparkline from "./Sparkline";
import PersonaCard from "./PersonaCard";
import TrustPanel from "./TrustPanel";
import AnimatedNumber from "./AnimatedNumber";

type Phase = "idle" | "asking" | "talking" | "error";
type Counters = { done: number; total: number; calls: number; tin: number; tout: number; dropped: number };
const ZERO: Counters = { done: 0, total: 0, calls: 0, tin: 0, tout: 0, dropped: 0 };

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const fmtTok = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v).toLocaleString("en-US"));

export default function Kansa() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [regions, setRegions] = useState<FeatureCollection | null>(null);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [dataMissing, setDataMissing] = useState(false);

  const [tab, setTab] = useState<"map" | "trust">("map");
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const [cached, setCached] = useState(false);
  const [mock, setMock] = useState(false);
  const [counters, setCounters] = useState<Counters>(ZERO);
  const [seconds, setSeconds] = useState(0);
  const [history, setHistory] = useState<{ national: number; pol: number }[]>([]);
  const [headline, setHeadline] = useState<"none" | "yes" | "no">("none");
  const [bullets, setBullets] = useState<string[]>([]);
  const [narrating, setNarrating] = useState(false);
  const [selected, setSelected] = useState<Persona | null>(null);
  const [version, setVersion] = useState(0);

  const answers = useRef(new Map<number, number>());
  const quotes = useRef(new Map<number, string>());
  const llm = useRef(new Map<number, boolean>());
  const base = useRef<Counters>(ZERO);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<{ t0: number; id: number } | null>(null);
  const bump = useRef(0);

  // Load data; poll until the data files exist.
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const load = async () => {
      const [p, r, c] = await Promise.all([
        personas.length ? Promise.resolve(personas) : loadPersonas(),
        regions ? Promise.resolve(regions) : loadRegions(),
        loadCalibration(),
      ]);
      if (!alive) return;
      if (p && !personas.length) setPersonas(p);
      if (r && !regions) setRegions(r);
      if (c) setCal(c);
      const missing = !p || !r;
      setDataMissing(missing && tries > 0);
      tries++;
      if (missing || !c) setTimeout(load, missing ? 8000 : 30000);
    };
    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const agg = useMemo(() => aggregate(personas, answers.current), [personas, version]);
  const demo = DEMO_QUESTIONS.find((d) => d.question === question);

  const scheduleBump = () => {
    if (bump.current) return;
    bump.current = requestAnimationFrame(() => {
      bump.current = 0;
      setVersion((v) => v + 1);
    });
  };

  const startTimer = () => {
    stopTimer();
    const t0 = performance.now() - seconds * 1000;
    const id = window.setInterval(() => setSeconds((performance.now() - t0) / 1000), 100);
    timer.current = { t0, id };
  };
  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current.id);
    timer.current = null;
  };

  const handle = useCallback((e: AnyEvent, expectTotal: number) => {
    if (e.cached) setCached(true);
    if (e.mock) setMock(true);
    if (e.type === "batch" && Array.isArray(e.results)) {
      for (const r of e.results as Answer[]) {
        if (typeof r?.id !== "number") continue;
        answers.current.set(r.id, Math.max(0, Math.min(1, num(r.p_yes, 0.5))));
        if (r.quote) quotes.current.set(r.id, r.quote);
        llm.current.set(r.id, r.llm !== false);
      }
      scheduleBump();
    } else if (e.type === "progress") {
      const b = base.current;
      setCounters({
        done: b.done + num(e.done),
        total: b.total + num(e.total, expectTotal),
        calls: b.calls + num(e.calls),
        tin: b.tin + num(e.tokens_in),
        tout: b.tout + num(e.tokens_out),
        dropped: b.dropped + num(e.dropped),
      });
    } else if (e.type === "error") {
      setError(String(e.message || "The simulation stopped with an error."));
    }
     
  }, []);

  const commitBase = () => {
    setCounters((c) => {
      base.current = c;
      return c;
    });
  };

  async function runStream(url: string, body: unknown, expectTotal: number) {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    await postSSE(url, body, (e) => handle(e, expectTotal), ac.signal);
    commitBase();
  }

  async function narrate(q: string) {
    setNarrating(true);
    setBullets([]);
    try {
      const a = aggregate(personas, answers.current);
      const r = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, aggregates: toServerAggregates(a) }),
      });
      if (!r.ok) return;
      const ct = r.headers.get("content-type") || "";
      let list: string[] = [];
      if (ct.includes("json")) {
        const j = await r.json();
        const raw = j.bullets ?? j.text ?? j.summary ?? j;
        list = Array.isArray(raw) ? raw.map(String) : String(raw).split(/\n+/);
      } else {
        list = (await r.text()).split(/\n+/);
      }
      setBullets(list.map((s) => s.replace(/^\s*[-•*\d.)]+\s*/, "").trim()).filter(Boolean).slice(0, 3));
    } catch {
      /* narration is optional */
    } finally {
      setNarrating(false);
    }
  }

  async function ask(q: string, fromChip: boolean) {
    q = q.trim().slice(0, 240);
    if (!q || !personas.length || phase === "asking" || phase === "talking") return;
    setTab("map");
    setQuestion(q);
    setInput(q);
    setError("");
    setCached(false);
    setMock(false);
    setBullets([]);
    setRound(0);
    setHistory([]);
    setHeadline("none");
    answers.current = new Map();
    quotes.current = new Map();
    llm.current = new Map();
    base.current = ZERO;
    setCounters({ ...ZERO, total: fromChip ? 5000 : 1000 });
    setSeconds(0);
    setVersion((v) => v + 1);
    setPhase("asking");
    startTimer();
    const n = fromChip ? 5000 : 1000;
    try {
      await runStream("/api/ask", { question: q, n, live: !fromChip }, n);
      stopTimer();
      const a = aggregate(personas, answers.current);
      if (!a.n) {
        setError("No answers came back from Claude. Check the API key and rate limits, or try a suggested question (those can replay a cached run).");
        setPhase("error");
        return;
      }
      setHistory([{ national: a.national, pol: a.polarisation }]);
      setPhase("idle");
      narrate(q);
    } catch (err) {
      stopTimer();
      if ((err as Error).name === "AbortError") return;
      setError(`Couldn’t reach the simulation: ${(err as Error).message}`);
      setPhase("error");
    }
  }

  async function talk() {
    if (!question || !answers.current.size || phase === "asking" || phase === "talking") return;
    setPhase("talking");
    setError("");
    startTimer();
    const headlineText = headline !== "none" && demo ? demo.headlines[headline] : undefined;
    let hist = history.length ? [history[0]] : [{ national: agg.national, pol: agg.polarisation }];
    setHistory(hist);
    try {
      for (let r = 1; r <= 3; r++) {
        setRound(r);
        const states: Answer[] = [];
        answers.current.forEach((p, id) => states.push({ id, p_yes: p, quote: quotes.current.get(id) || "" }));
        await runStream(
          "/api/talk",
          { question, round: r, states, headline: r === 2 ? headlineText : undefined },
          states.length,
        );
        const a = aggregate(personas, answers.current);
        hist = [...hist, { national: a.national, pol: a.polarisation }];
        setHistory(hist);
      }
      setPhase("idle");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(`The talk round stopped: ${(err as Error).message}`);
      setPhase("error");
    } finally {
      stopTimer();
    }
  }

  useEffect(() => () => stopTimer(), []);

  // Deep link: /?q=<question> (used by the iMessage agent) auto-runs once data is in.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !personas.length) return;
    const q = new URLSearchParams(window.location.search).get("q")?.trim();
    if (!q) return;
    autoRan.current = true;
    ask(q, DEMO_QUESTIONS.some((d) => d.question.toLowerCase() === q.toLowerCase()) ? true : false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas]);

  const busy = phase === "asking" || phase === "talking";
  const answered = agg.n > 0;
  const pol0 = history[0]?.pol;
  const selP = selected ? answers.current.get(selected.id) : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-snow md:h-dvh md:overflow-hidden">
      {/* Header + question */}
      <header className="flex flex-col gap-3 border-b border-white/10 px-4 pb-3 pt-3 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-4">
            <h1 className="text-[2.4rem] font-bold leading-none tracking-[-0.03em] md:text-[2.8rem]">Kansa</h1>
            <p className="text-lg text-frost md:text-xl">Ask a country anything</p>
          </div>
          <nav className="flex gap-1 rounded-md bg-white/[0.05] p-1" aria-label="Views">
            {(
              [
                ["map", "Ask Finland"],
                ["trust", "Can you trust it?"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                aria-pressed={tab === k}
                className={`rounded px-3 py-1.5 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-snow ${
                  tab === k ? "bg-snow text-ink" : "text-frost hover:text-snow"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const chip = DEMO_QUESTIONS.some((d) => d.question === input.trim());
            ask(input, chip);
          }}
        >
          <label htmlFor="q" className="sr-only">Your question to Finland</label>
          <input
            id="q"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={240}
            placeholder="Ask 5,000 Finns a yes-or-no question…"
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/[0.04] px-4 py-3 text-lg text-snow placeholder:text-frost/70 focus:border-snow/60 focus:outline-none md:text-xl"
          />
          <button
            type="submit"
            disabled={busy || !personas.length || !input.trim()}
            className="rounded-md bg-snow px-5 text-lg font-semibold text-ink transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:opacity-40 md:px-7"
          >
            {phase === "asking" ? "Asking…" : "Ask"}
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {DEMO_QUESTIONS.map((d) => (
            <button
              key={d.slug}
              disabled={busy || !personas.length}
              onClick={() => ask(d.question, true)}
              className={`rounded-full border px-3 py-1 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-snow disabled:opacity-40 ${
                question === d.question ? "border-snow/70 text-snow" : "border-white/15 text-frost hover:border-white/40 hover:text-snow"
              }`}
            >
              {d.question}
            </button>
          ))}
          <span className="self-center text-[13px] text-frost/80">Or type your own: it runs live on 1,000 people.</span>
        </div>
      </header>

      {tab === "trust" ? (
        <main className="min-h-0 flex-1">
          <TrustPanel cal={cal} />
        </main>
      ) : (
        <>
          <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,7fr)_minmax(19rem,3fr)]">
            {/* Map */}
            <section className="relative h-[62vh] min-h-[360px] md:h-auto" aria-label="Map">
              {personas.length > 0 && (
                <FinlandMap
                  personas={personas}
                  regions={regions}
                  answers={answers.current}
                  llm={llm.current}
                  version={version}
                  selectedId={selected?.id ?? null}
                  onPick={setSelected}
                />
              )}
              {!personas.length && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-frost">
                  {dataMissing ? "Waiting for the persona file. The map appears as soon as it’s published." : "Loading 5,000 Finns…"}
                </div>
              )}
              {/* Legend */}
              <div className="pointer-events-none absolute left-4 top-3 flex items-center gap-2 text-[13px] text-frost">
                <span>No</span>
                <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${pColor(0)}, ${pColor(0.5)}, ${pColor(1)})` }} />
                <span>Yes</span>
                {round > 0 && <span className="ml-3">● Claude ○ neighbour rule</span>}
              </div>
              <div className="absolute right-3 top-3 flex gap-2">
                {cached && <span className="rounded-full border border-white/25 px-2 py-0.5 text-[12px] text-frost">Cached run</span>}
                {mock && <span className="rounded-full bg-[#f0883e] px-2 py-0.5 text-[12px] font-semibold text-ink">Mock</span>}
              </div>
              {selected && (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 flex md:inset-x-auto md:bottom-auto md:right-4 md:top-12 md:justify-end">
                  <PersonaCard
                    persona={selected}
                    p={selP}
                    quote={quotes.current.get(selected.id)}
                    llm={llm.current.get(selected.id)}
                    onClose={() => setSelected(null)}
                  />
                </div>
              )}
              {answered && !selected && !busy && (
                <p className="pointer-events-none absolute bottom-3 left-4 text-[13px] text-frost">Click any dot to meet that person.</p>
              )}
            </section>

            {/* Stats */}
            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-white/10 px-4 py-4 md:border-l md:border-t-0 md:px-5" aria-label="Results">
              <div>
                <div className="text-[15px] text-frost">{question ? "Finland says yes" : "Ask a question to start"}</div>
                <div className="text-[5.5rem] font-bold leading-[0.9] tracking-[-0.04em] tabular-nums" style={{ color: answered ? "#eef2f5" : "#3b4f68" }}>
                  {answered ? <AnimatedNumber value={agg.national * 100} format={(v) => `${Math.round(v)}%`} /> : "–"}
                </div>
                {question && <p className="mt-1 line-clamp-2 text-[14px] text-snow/90">{question}</p>}
              </div>

              {/* Counter */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-white/10 py-3">
                <div className="col-span-2">
                  <dt className="text-[13px] text-frost">{round > 0 ? "Answers, including talk rounds" : "People answered"}</dt>
                  <dd className="text-[2rem] font-semibold leading-none tabular-nums">
                    <AnimatedNumber value={counters.done} />
                    <span className="text-lg text-frost"> / {(counters.total || personas.length || 5000).toLocaleString("en-US")}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] text-frost">Claude calls</dt>
                  <dd className="text-2xl font-semibold tabular-nums"><AnimatedNumber value={counters.calls} /></dd>
                </div>
                <div>
                  <dt className="text-[13px] text-frost">Seconds</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{seconds.toFixed(1)}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-frost">Tokens in</dt>
                  <dd className="text-2xl font-semibold tabular-nums"><AnimatedNumber value={counters.tin} format={fmtTok} /></dd>
                </div>
                <div>
                  <dt className="text-[13px] text-frost">Tokens out</dt>
                  <dd className="text-2xl font-semibold tabular-nums"><AnimatedNumber value={counters.tout} format={fmtTok} /></dd>
                </div>
                {counters.dropped > 0 && (
                  <p className="col-span-2 text-[12px] text-frost">{counters.dropped.toLocaleString("en-US")} answers dropped for bad output.</p>
                )}
              </dl>

              {error && <p className="rounded border border-[#f0883e]/60 px-3 py-2 text-[14px] text-snow">{error}</p>}

              {(narrating || bullets.length > 0) && (
                <div>
                  <h2 className="mb-1 text-[15px] font-semibold">Why Finland split</h2>
                  {narrating ? (
                    <p className="text-[14px] text-frost">Claude is reading the results…</p>
                  ) : (
                    <ul className="list-disc space-y-1 pl-4 text-[14px] leading-snug text-snow/90">
                      {bullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {answered && (
                <>
                  <div>
                    <h2 className="mb-1.5 text-[15px] font-semibold">By region</h2>
                    <Bars rows={agg.by_region} />
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <h2 className="mb-1.5 text-[15px] font-semibold">By age</h2>
                      <Bars rows={agg.by_age} compact />
                    </div>
                    <div>
                      <h2 className="mb-1.5 text-[15px] font-semibold">By income</h2>
                      <Bars rows={agg.by_income} compact />
                    </div>
                  </div>
                </>
              )}
            </aside>
          </main>

          {/* Society bar */}
          <section className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 px-4 py-3 md:px-6" aria-label="Let them talk">
            <button
              onClick={talk}
              disabled={busy || !answered}
              className="rounded-md border-2 border-snow px-5 py-2.5 text-lg font-semibold text-snow transition-colors hover:bg-snow hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:border-white/20 disabled:text-frost/60 disabled:hover:bg-transparent"
            >
              {phase === "talking" ? `Talking, round ${round} of 3…` : round === 3 ? "Talk again" : "Let them talk"}
            </button>
            <label className="flex items-center gap-2 text-[14px] text-frost">
              Headline before round 2
              <select
                value={headline}
                onChange={(e) => setHeadline(e.target.value as typeof headline)}
                disabled={busy || !demo}
                className="max-w-[22rem] rounded border border-white/15 bg-ink px-2 py-1.5 text-[14px] text-snow disabled:opacity-50"
              >
                <option value="none">No headline</option>
                {demo && <option value="yes">{demo.headlines.yes}</option>}
                {demo && <option value="no">{demo.headlines.no}</option>}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <Sparkline values={history.map((h) => h.national)} />
              <div className="text-[13px] leading-tight text-frost">
                Support
                <div className="text-lg font-semibold tabular-nums text-snow">
                  {history.length ? history.map((h) => Math.round(h.national * 100)).join(" → ") : "–"}
                </div>
              </div>
            </div>
            <div className="flex min-w-[14rem] flex-1 items-center gap-3">
              <div className="text-[13px] leading-tight text-frost">
                Polarisation
                <div className="text-[11px]">share below 20% or above 80%</div>
              </div>
              <div className="relative h-3 flex-1 rounded-full bg-white/[0.07]">
                {pol0 != null && (
                  <span className="absolute inset-y-[-3px] w-0.5 bg-frost" style={{ left: `${pol0 * 100}%` }} title="Before talking" />
                )}
                <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#f0883e] to-[#22b8a8] transition-[width] duration-500" style={{ width: `${(answered ? agg.polarisation : 0) * 100}%` }} />
              </div>
              <div className="text-xl font-semibold tabular-nums">
                {pol0 != null && history.length > 1 && <span className="text-frost">{Math.round(pol0 * 100)}% → </span>}
                {answered ? `${Math.round(agg.polarisation * 100)}%` : "–"}
              </div>
            </div>
          </section>
        </>
      )}

      <footer className="border-t border-white/10 px-4 py-2 text-[12px] text-frost md:px-6">
        Every dot is a synthetic person sampled from Statistics Finland data, answered by Claude. It’s a simulation, not a poll. Persona data from{" "}
        <a className="underline hover:text-snow" href="https://github.com/eemil100/synthetic_dataset_of_Finland" target="_blank" rel="noreferrer">
          eemil100/synthetic_dataset_of_Finland
        </a>
        , built before tonight.
      </footer>
    </div>
  );
}
