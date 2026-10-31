// POST /api/analyze {ticker, date, facts} → SSE: 진행 → 급등·정지 이유 분석
import { z } from "zod";
import { analyze, claudeReady, ClaudeError, type Analysis } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 300;
const Body = z.object({ ticker: z.string().regex(/^[A-Z.\-]{1,8}$/), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), facts: z.string().max(3000) });
const cache = new Map<string, { at: number; a: Analysis }>();

export async function POST(req: Request) {
  if (!claudeReady()) return Response.json({ error: "분석은 Anthropic 키(ANTHROPIC_API_KEY)를 넣은 뒤에 쓸 수 있어요." }, { status: 400 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "요청 형식이 맞지 않아요." }, { status: 400 });
  const { ticker, date, facts } = p.data, refresh = new URL(req.url).searchParams.get("refresh") === "1", key = `${ticker}:${date}`;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: object) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      const ping = setInterval(() => c.enqueue(enc.encode(": ping\n\n")), 15_000);
      let n = 0;
      try {
        const hit = cache.get(key);
        const a = !refresh && hit && Date.now() - hit.at < 30 * 60_000 ? hit.a
          : await analyze(ticker, date, facts, () => send({ type: "status", text: `뉴스·공시 검색 중… (${++n}회)` }));
        cache.set(key, { at: Date.now(), a });
        send({ type: "result", analysis: a, at: new Date().toISOString() });
      } catch (e) { send({ type: "error", message: e instanceof ClaudeError ? e.message : "분석 중 문제가 생겼어요." }); }
      finally { clearInterval(ping); c.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
