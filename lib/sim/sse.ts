import type { SimEvent } from "../types";

export function sseResponse(gen: AsyncGenerator<SimEvent>, signal?: AbortSignal): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(": kansa\n\n"));
      try {
        for await (const ev of gen) {
          if (signal?.aborted) break;
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

export const originOf = (req: Request) => new URL(req.url).origin;
