import type { DemoQuestion } from "./types";

export function slugify(q: string): string {
  return q.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    slug: "car-ban",
    question: "Should private cars be banned from central Helsinki by 2030?",
    headlines: {
      no: "Helsinki car ban would cut 2,000 retail jobs, study says",
      yes: "Paris saw air pollution fall 40% after car limits",
    },
  },
  {
    slug: "ai-tax-ubi",
    question: "Should AI companies pay a tax that funds a basic income for everyone?",
    headlines: {
      no: "AI firms threaten to move Nordic offices abroad over proposed tax",
      yes: "Report: AI automation could eliminate 1 in 5 Finnish office jobs by 2032",
    },
  },
  {
    slug: "ai-doctor",
    question: "Would you pay €9 a month for an AI doctor you can text any time?",
    headlines: {
      no: "AI health chatbot gave wrong dosage advice, regulator says",
      yes: "Health centre queues in Finland hit record 6 weeks",
    },
  },
];
