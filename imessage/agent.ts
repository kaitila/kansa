// Text Finland: an iMessage agent for Kansa (Photon Spectrum SDK).
// Incoming text = a question for 500 synthetic Finns. Reply in two bubbles.
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const KANSA_URL = (process.env.KANSA_URL ?? "").replace(/\/$/, "");
if (!KANSA_URL) throw new Error("Set KANSA_URL, e.g. https://kansa.vercel.app");

const EXAMPLES = [
  "Should saunas be mandatory in every office?",
  "Should private cars be banned from central Helsinki by 2030?",
  "Would you pay €9 a month for an AI doctor you can text any time?",
];

const BLOCKLIST = /\b(kill|rape|nazi|n[i1]gg|f[a@]g|bomb)\b/i;

type Quote = { id: number; p_yes: number; quote: string; name?: string; age?: number; municipality?: string };
type Done = {
  type: "done";
  national: number;
  by_region: Record<string, number>;
  n: number;
  cached?: boolean;
  quotes?: Quote[];
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

function summarise(d: Done): string {
  const regions = Object.entries(d.by_region).sort((a, b) => b[1] - a[1]);
  const uusimaa = d.by_region["Uusimaa"];
  const lapland = d.by_region["Lappi"] ?? d.by_region["Lapland"];
  const parts: string[] = [];
  if (uusimaa !== undefined) parts.push(`Helsinki region ${pct(uusimaa)}`);
  if (lapland !== undefined) parts.push(`Lapland ${pct(lapland)}`);
  if (parts.length < 2 && regions.length >= 2) {
    const [hi, lo] = [regions[0], regions[regions.length - 1]];
    parts.splice(0, parts.length, `${hi[0]} ${pct(hi[1])}`, `${lo[0]} ${pct(lo[1])}`);
  }
  return `Finland says ${pct(d.national)} yes. ${parts.join(", ")}.`;
}

function quoteBubble(d: Done, question: string): string {
  const q = d.quotes?.find((x) => x.name && x.municipality) ?? d.quotes?.[0];
  const link = `${KANSA_URL}/?q=${encodeURIComponent(question)}`;
  if (!q) return `See the map: ${link}`;
  const who = [q.name, q.age, q.municipality].filter(Boolean).join(", ");
  return `"${q.quote}" (${who})\n\nSee all 5,000 on the map: ${link}`;
}

async function ask(question: string): Promise<Done> {
  const res = await fetch(`${KANSA_URL}/api/ask?format=json`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, n: 500, live: true }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Kansa ${res.status}`);
  return (await res.json()) as Done;
}

const projectId = process.env.PROJECT_ID ?? process.env.SPECTRUM_PROJECT_ID;
const projectSecret = process.env.PROJECT_SECRET ?? process.env.SPECTRUM_PROJECT_SECRET;
if (!projectId || !projectSecret) throw new Error("Set PROJECT_ID and PROJECT_SECRET from app.photon.codes → Settings");

const app = await Spectrum({
  projectId,
  projectSecret,
  providers: [imessage.config()],
});

console.log("Text Finland is listening. Kansa:", KANSA_URL);

for await (const [space, message] of app.messages) {
  if (message.content.type !== "text") continue;
  const question = message.content.text.trim().slice(0, 300);
  console.log(`[${message.sender?.id ?? "?"}] ${question}`);

  // Handle each message without blocking the loop.
  void (async () => {
    try {
      if (question.length < 8 || BLOCKLIST.test(question)) {
        await space.send(
          "Ask 5,000 synthetic Finns a yes/no question. Try one of these:",
          EXAMPLES.map((e) => `• ${e}`).join("\n"),
        );
        return;
      }
      await space.responding(async () => {
        const d = await ask(question);
        await space.send(summarise(d), quoteBubble(d, question));
      });
    } catch (err) {
      console.error(err);
      await space.send("Finland is thinking too hard right now. Try again in a minute.").catch(() => {});
    }
  })();
}
