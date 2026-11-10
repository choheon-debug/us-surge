// POST /api/chat {date, messages} → SSE: 답변 글자를 차례로 (그날 정지·급등 목록을 함께 준다)
import { z } from "zod";
import { chat, claudeReady, ClaudeError } from "@/lib/claude";
import { day } from "@/lib/data";
import { etHm, kstHm } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 120;
const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  journal: z.string().max(8000).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(20),
});

export async function POST(req: Request) {
  if (!claudeReady()) return Response.json({ error: "질문 기능은 Anthropic 키(ANTHROPIC_API_KEY)를 넣은 뒤에 쓸 수 있어요." }, { status: 400 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success || p.data.messages.at(-1)?.role !== "user") return Response.json({ error: "질문 내용이 맞지 않아요." }, { status: 400 });
  const { date, messages, journal } = p.data;
  const d = await day(date).catch(() => null);
  const line = (r: NonNullable<typeof d>["halts"][number]) => `${r.ticker}(${r.name}) ${r.rate != null ? `${r.rate > 0 ? "+" : ""}${r.rate}%` : ""} 정지 ${r.halts.map(h => `${h.code} ${etHm(h.halt)}ET/${kstHm(h.halt)}KST`).join(", ") || "없음"}`;
  const ctx = d ? `[${date} 거래정지 ${d.halts.length}종목]\n${d.halts.slice(0, 40).map(line).join("\n")}\n[${date} +20% 급등 ${d.gainers.length}종목]\n${d.gainers.slice(0, 30).map(line).join("\n")}` : `[${date}] 목록을 가져오지 못함`;
  const ctxAll = journal ? `${ctx}\n${journal}\n(사용자가 자기 매매를 물으면 이 일지로 답하고, 숫자는 일지에 있는 것만 쓴다. 습관·위험을 알려 주되 매수·매도를 권하지 않는다.)` : ctx;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: object) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      let n = 0;
      try { await chat(ctxAll, messages, text => send({ type: "text", text }), () => send({ type: "status", text: `검색 중… (${++n}회)` })); send({ type: "done" }); }
      catch (e) { send({ type: "error", message: e instanceof ClaudeError ? e.message : "답변 중 문제가 생겼어요." }); }
      finally { c.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
