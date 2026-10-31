// Shared contracts. Frozen: change only with all owners agreeing.

export type Persona = {
  id: number;
  age: number;
  gender: "M" | "F";
  municipality: string;
  region: string; // one of 19 maakunnat, matches regions.geojson property "region"
  lat: number;
  lon: number;
  education: string; // "basic" | "upper secondary" | "vocational" | "bachelor" | "master+" (free text ok)
  activity: string; // "employed" | "unemployed" | "student" | "pensioner" | "other"
  income_decile: number; // 1..10
  language: string; // "Finnish" | "Swedish" | "Other"
  name: string;
  blurb: string; // <= 25 words
  weight: number;
};

export type Answer = { id: number; p_yes: number; quote: string; llm?: boolean };

export type Aggregates = {
  national: number;
  by_region: Record<string, number>;
  by_age: Record<string, number>;
  by_income: Record<string, number>;
  polarisation: number; // share with p<0.2 or p>0.8
  n: number;
};

export type SimEvent =
  | { type: "batch"; results: Answer[]; cached?: boolean }
  | {
      type: "progress";
      done: number;
      total: number;
      calls: number;
      tokens_in: number;
      tokens_out: number;
      ms: number;
      dropped?: number;
      cached?: boolean;
    }
  | ({ type: "done"; cached?: boolean; quotes?: (Answer & { name?: string; age?: number; municipality?: string })[] } & Aggregates)
  | { type: "error"; message: string };

export type AskRequest = { question: string; n: 1000 | 5000 | number; live?: boolean };
export type TalkRequest = {
  question: string;
  round: number;
  states: Answer[];
  headline?: string;
  llm_n?: number; // how many to send to the LLM; rest use Hegselmann-Krause
};
export type NarrateRequest = { question: string; aggregates: Aggregates };

export type Calibration = {
  national: { synthetic: number; real: number }; // Stubb share 0..100
  by_region: { region: string; synthetic: number; real: number }[];
  r: number;
  mae_points: number;
  note: string;
  preliminary?: boolean;
};

export type DemoQuestion = {
  slug: string;
  question: string;
  headlines: { yes: string; no: string };
};
