# Kansa — ask a country anything

*Kansa* is Finnish for "the people". Ask a question, and 5,000 statistically grounded synthetic Finns answer it in about 20 seconds, live on a map. Then they talk to their neighbours and you watch opinion move. Then you see how far to trust it: synthetic Finland re-votes the 2024 presidential runoff and we compare it with the real result, region by region.

Built at Night Hack (Founders, Inc., San Francisco, 30 Oct 2026) by Eemil Ylä-Nikkilä, Juho-Matti Kilpeläinen, Arttu Kaitila and Robin Hansson.

## What it does

1. **Ask.** 5,000 personas, shuffled into batches of 20, each answer with a probability `p_yes` and a 15-word first-person quote. The answers stream to the map, and a counter shows Claude calls, tokens and seconds.
2. **Let them talk.** Each person has six social ties: four in their own region matched by age, education and language, plus two random long-range ties. In each of three rounds, people read three neighbours' quotes (optionally a news headline) and update. People not sent to the LLM update with the Hegselmann–Krause bounded-confidence rule. Solid dots were updated by the LLM, hollow dots by the rule.
3. **Can you trust it?** A scatter of synthetic vs real 2024 runoff vote shares by region, with Pearson r and mean absolute error.

## Run locally

```bash
npm install
cp .env.example .env.local   # or set the vars below
npm run dev
```

| Env var | Meaning |
|---|---|
| `ANTHROPIC_API_KEYS` | Comma-separated Anthropic API keys, used round-robin |
| `KANSA_CONCURRENCY` | Max concurrent Claude calls (default 50) |

Demo questions replay from `public/cache/<slug>.json` when present, labelled "cached run". A cached run is never shown as live.

## Architecture

- **One Next.js app (App Router, TypeScript) on Vercel.** Python is used offline for data prep and calibration only.
- `public/data/personas.json`: 5,000 personas sampled from Statistics Finland municipality-level marginals, placed at their municipality centroid plus jitter.
- `public/data/regions.geojson`: the 19 maakunnat.
- `public/data/calibration_runoff2024.json`: synthetic vs real runoff by region.
- `app/api/ask`, `app/api/talk`, `app/api/narrate`: route handlers that stream Server-Sent Events. `lib/sim/` holds the engine, the social graph and the bounded-confidence update.
- Frontend: a single `<canvas>` with d3-geo (no map tiles, no API keys), 600 ms colour tweens per round.
- Models: `claude-haiku-5-5` for the crowd, `claude-sonnet-5-5` for the narrator.
- `imessage/`: "Text Finland", an iMessage agent on Photon Spectrum that calls `/api/ask?format=json`.

Shared contracts live in `lib/types.ts`.

## Cost

Haiku 5.5 costs $0.10 per M input tokens and $0.50 per M output tokens, for prompts under 100K tokens. A 5,000-person question is about 250 calls, ~450K input and ~160K output tokens, so **about $0.13**. A full demo (ask plus three talk rounds) is about $0.53.

## Disclosure: what existed before the hackathon

Eemil's open-source [synthetic_dataset_of_Finland](https://github.com/eemil100/synthetic_dataset_of_Finland) provided the cached Statistics Finland marginals, the municipality GeoJSON and the DVV name lists. Persona generation for this app, the engine, the society layer, the calibration and the web UI were written during the event.

## Caveats

- **Agreeableness and tilt.** LLM personas over-agree and lean liberal and urban. Asking for probabilities and telling the model people disagree helps, but doesn't remove it.
- **Stereotypes.** Personas can become caricatures of their demographics.
- **Knowledge leakage.** The model knows who won in 2024, so the national calibration number is contaminated. The regional structure is the meaningful test.
- **Independence.** Personas are drawn from marginal distributions, so joint correlations are approximate.
- **Fiction.** Headlines used in the simulation are invented for the demo, not real news.
- This is a research demo, not a poll. Don't cite its numbers as public opinion.
