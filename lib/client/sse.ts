// POST + ReadableStream SSE reader (EventSource can't POST).
export type AnyEvent = Record<string, unknown> & { type?: string };

export async function postSSE(
  url: string,
  body: unknown,
  onEvent: (e: AnyEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const t = await res.text();
      if (t) msg = t.slice(0, 300);
    } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get("content-type") || "";
  // Tolerate a plain JSON response (single event or array of events).
  if (ct.includes("application/json")) {
    const j = await res.json();
    (Array.isArray(j) ? j : [j]).forEach((e) => onEvent(e));
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
      dispatch(raw, onEvent);
    }
  }
  if (buf.trim()) dispatch(buf, onEvent);
}

function dispatch(raw: string, onEvent: (e: AnyEvent) => void) {
  const data = raw
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data || data === "[DONE]") return;
  try {
    onEvent(JSON.parse(data));
  } catch {
    // ignore keep-alives / partial junk
  }
}
