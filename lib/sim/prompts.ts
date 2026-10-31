import type Anthropic from "@anthropic-ai/sdk";

export const CROWD_INSTRUCTIONS = `You simulate how specific residents of Finland would answer a survey
question. Each person below is sampled from Statistics Finland data:
age, gender, municipality, region, education, main activity, income
decile, language group. Answer as that person would, given their real
life circumstances in their town. People like this disagree with each
other; do not give everyone the same answer, and do not stereotype
beyond what their situation makes plausible.

Return only a JSON array, one object per person, in input order:
{"id": <id>, "p_yes": <0..1 probability they support or answer yes>,
 "quote": "<first person, max 15 words, concrete reason from their life>"}
No prose before or after the array.`;

export const TALK_INSTRUCTIONS = `You simulate how specific residents of Finland update their opinion on a
survey question after talking with people they know. Each person is sampled
from Statistics Finland data (age, gender, municipality, region, education,
main activity, income decile, language group).

For each person you see their previous answer (p = probability of yes, and
their own words) and what three people they know said. Here is what people
you know said. You can be persuaded, stay put, or harden your view; be
realistic about how stubborn someone like you is. Most people move a little
or not at all; some harden when they hear the other side. People marked
[saw headline] have just seen today's headline and may react to it.

Return only a JSON array, one object per person, in input order:
{"id": <id>, "p_yes": <0..1 updated probability of yes>,
 "quote": "<first person, max 15 words, what they think now and why>"}
No prose before or after the array.`;

export function crowdSystem(question: string): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: CROWD_INSTRUCTIONS },
    { type: "text", text: `Question: ${question}`, cache_control: { type: "ephemeral" } },
  ];
}

export function talkSystem(question: string, headline?: string | null): Anthropic.TextBlockParam[] {
  const head = headline ? `\n\nToday's headline (fictional, for this simulation): "${headline}"` : "";
  return [
    { type: "text", text: TALK_INSTRUCTIONS },
    { type: "text", text: `Question: ${question}${head}`, cache_control: { type: "ephemeral" } },
  ];
}
