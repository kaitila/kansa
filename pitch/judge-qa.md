# Judge Q&A — crisp answers

Eemil takes method and trust questions. Robin takes market and business questions. Keep each answer to two or three sentences, then stop.

## "Isn't this just an LLM's opinion?" (Eemil)
"That's exactly the question. Each answer is conditioned on a statistically real person: age, town, income decile, education and language drawn from Statistics Finland. And we checked it against a real election by region. Here's the error, and here's where it breaks."

## "How do you know it's right?" (Eemil)
"We don't assume it. We re-ran the 2024 presidential runoff, real result Stubb 51.6 / Haavisto 48.4, and compare region by region: r = [0.x], mean error [y] points. The national number is contaminated, since the model knows who won. The regional structure is the real test, because it has to come from the personas."

## "Why Finland?" (Eemil)
"Statistics Finland publishes open, municipality-level marginals for age, education, income, activity and language, and Finland has clean regional election results to check against. A small country with open statistics is a verifiable test bed. Nobody can check a synthetic America this cheaply."

## "What are the known failure modes?" (Eemil, say them before they ask if there's time)
- **Agreeableness:** LLM personas over-agree with the question as phrased. We ask for a probability, not yes/no, and tell the model people disagree.
- **Liberal / urban tilt:** models skew progressive. The calibration scatter shows where it happens, typically rural regions.
- **Stereotype amplification:** "a 71-year-old pensioner in Kainuu" can become a caricature. The prompt forbids stereotyping beyond what the person's situation makes plausible. Persona cards make it visible.
- **Knowledge leakage:** on famous questions the model recalls real polls instead of reasoning. That's why we don't count the national runoff number as evidence.
- **Independence assumption:** personas are sampled from marginals, so joint correlations (say, education × language × region) are only approximate. Post-stratification weights help, but don't fully fix it.
- **Within-batch anchoring:** 20 personas share a call. We shuffle batches so a region is never batched together, otherwise it would show up as a fake regional effect.

## "How does the society layer work?" (Eemil)
"Each person has six ties: four in their own region, matched by age, education and language, and two random long-range ties. Each round they read three neighbours' quotes and update. People not sent to the LLM update with a bounded-confidence rule, Hegselmann–Krause. Solid dots are LLM-updated, hollow dots are rule-updated, and we show that honestly."

## "What does a question cost?" (Robin)
Claude Haiku 5.5 is **$0.10 per M input tokens and $0.50 per M output tokens** for prompts under 100K tokens. Each of our calls is ~2K tokens, far under that.

| Run | Calls | Input | Output | Cost |
|---|---|---|---|---|
| Live ask, 1,000 people | 50 | ~90K | ~35K | **~$0.03** |
| Full ask, 5,000 people | 250 | ~450K | ~160K | **~$0.13** |
| Full demo (ask + 3 talk rounds) | 1,000 | ~2M | ~650K | **~$0.53** |

Narrator summary (Sonnet 5.5, $2 / $10 per M) adds under a cent.
"A national phone poll of about 1,000 people takes weeks and costs thousands of euros. This costs about 13 cents and 20 seconds. It doesn't replace the poll; it lets you ask 1,000 questions before you pay for one."
(Poll cost is a rough industry range, not a quote we verified tonight. Don't put a precise euro figure on it.)

## "Who else does this? What's the market?" (Robin)
- **Aaru** (New York): synthetic populations of AI agents for market research, election prediction and policy simulation. Raised a Series A led by Redpoint at a reported $1B headline valuation (TechCrunch, Dec 2025). Its best-known claim is a ~5,000-agent simulation of the 2024 New York Democratic primary.
- **Simile** (Palo Alto): founded by the Stanford "generative agents" (Smallville) researchers, led by Joon Sung Park. Raised $100M led by Index Ventures, and later reports put it at ~$2B. Partnered with Gallup to anchor simulations in a probability-based panel.
- **Our wedge:** "They sell trust in a black box. We start from open national statistics and publish the error against a real election, region by region. Small countries with open data are where you can verify a synthetic society, and that's where we start."

## "What did you build tonight vs before?" (Robin)
"Eemil's open-source repo had the Statistics Finland marginals, the municipality map and the name lists. Tonight we built persona generation from those marginals, the Claude fan-out engine, the society layer, the calibration run and the whole web app."

## "What's next?" (Robin)
"Calibrate against more elections and referendums, then sell it to the people who run polls today: municipalities testing a policy, brands testing a price, newsrooms testing a story. Then the other Nordics, which have the same kind of open statistics."

## Live judge question goes weird
Steer: "Let's try one of these." Tap a chip. Questions are length-limited and nothing is logged with names.

---
Sources: [TechCrunch — Aaru Series A](https://techcrunch.com/2025/12/05/ai-synthetic-research-startup-aaru-raised-a-series-a-at-a-1b-headline-valuation), [OfficeChai — Simile $100M](https://officechai.com/ai/simile-raises-100-million-to-create-simulations-of-a-society-populated-by-ai-agents), [Newcomer — startups simulating people](https://newcomer.co/p/startups-target-the-tricky-task-of), Haiku 5.5 / Sonnet 5.5 pricing from Anthropic's model table (cached 2026-10-06 in the Claude API reference), cross-checked with [eesel.ai](https://www.eesel.ai/blog/claude-haiku-5-5-pricing). Simile's $2B valuation and Aaru's revenue come from secondary blogs and are unverified.
