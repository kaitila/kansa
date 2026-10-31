# Submission — Night Hack (Founders, Inc.)

Robin submits at **20:50**. Fill every `[BRACKET]` first.

**Name:** Kansa — ask a country anything

**One line:** 5,000 statistically real synthetic Finns answer any question in 20 seconds, argue with their neighbours, and get checked against a real election.

**What we built tonight:**
- A persona generator that samples 5,000 Finns from Statistics Finland municipality-level marginals (age, gender, education, main activity, income decile, language) with real Finnish names, placed on the map at their municipality.
- A Claude fan-out engine that runs thousands of persona-conditioned answers in parallel (shuffled batches of 20, multi-key pool, concurrency control, zod validation, retries, streamed to the browser over SSE), with a live counter of calls, tokens and seconds.
- A society layer: a seeded small-world social graph (four same-region ties by similarity, two random long-range ties per person). People update their views from neighbours' quotes and react to a news headline. A Hegselmann–Krause bounded-confidence fallback handles scale, with LLM-updated vs rule-updated people shown honestly in the UI.
- A calibration run: synthetic Finland re-votes the February 2024 presidential runoff, compared with the real Statistics Finland result by region (r = [0.x], MAE [y] points).
- A deployed web UI: canvas map of Finland's 19 regions with 5,000 dots, persona cards, region, age and income breakdowns, a polarisation meter and a sparkline across rounds.
- [An iMessage agent you can text: "Text Finland" — built on Photon Spectrum.]

**What existed before kickoff (disclosure):** Eemil's open-source repo [github.com/eemil100/synthetic_dataset_of_Finland](https://github.com/eemil100/synthetic_dataset_of_Finland). We reused its cached Statistics Finland marginals (data/cache_phase2), its municipality GeoJSON and its DVV first-name and surname lists. That repo also contains an earlier Streamlit + Folium prototype and an LLM enrichment step; we did **not** use those tonight. The persona export script, engine, society layer, calibration, web app and iMessage agent were all written during the event.

**Tools:** Claude (Haiku 5.5 for the crowd, Sonnet 5.5 for narration), Claude Code, Next.js, Vercel, d3-geo, zod, Statistics Finland open data (PXWeb)[, Photon Spectrum].

**Demo:** [https://PUBLIC-URL] — works on a phone. Tap a suggestion chip for an instant cached run (labelled "cached run"), or type your own question for a live one.
[iMessage: text [HANDLE] any yes/no question.]

**Team:** Eemil Ylä-Nikkilä, Juho-Matti Kilpeläinen, Arttu Kaitila, Robin Hansson.
**Captain contact:** [NAME], [PHONE], [EMAIL]

**Honest caveats:** LLM personas show agreeableness and a liberal/urban tilt; personas are sampled from marginals, so joint distributions are approximate; the national runoff number is contaminated by the model knowing the result, so the regional comparison is the real test. Headlines used in the simulation are fictional.
