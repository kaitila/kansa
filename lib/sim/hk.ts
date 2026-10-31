// Hegselmann–Krause bounded confidence: each person moves toward the average of
// neighbours whose opinion is within eps of their own.
//   p_i <- p_i + mu * mean_{j in N_i, |p_j - p_i| < eps} (p_j - p_i)
import type { Graph } from "./graph";

export function hkUpdate(
  ids: Iterable<number>,
  prev: Map<number, number>,
  graph: Graph,
  mu = 0.3,
  eps = 0.3,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of ids) {
    const pi = prev.get(id);
    if (pi === undefined) continue;
    let sum = 0, k = 0;
    for (const j of graph.get(id) ?? []) {
      const pj = prev.get(j);
      if (pj === undefined) continue;
      if (Math.abs(pj - pi) < eps) {
        sum += pj - pi;
        k++;
      }
    }
    out.set(id, k ? Math.min(1, Math.max(0, pi + (mu * sum) / k)) : pi);
  }
  return out;
}
