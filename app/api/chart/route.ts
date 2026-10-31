// GET /api/chart?t=KNRX&d=2026-10-30&i=1m|5m|1d → 차트 봉 + 그날 정지 구간
import { haltsOn } from "@/lib/halts";
import { intraday } from "@/lib/yahoo";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, t = (q.get("t") ?? "").toUpperCase(), d = q.get("d") ?? "", i = q.get("i") ?? "5m";
  if (!/^[A-Z.\-]{1,8}$/.test(t) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !["1m", "5m", "1d"].includes(i)) return Response.json({ error: "요청 형식이 맞지 않아요." }, { status: 400 });
  const [c, hs] = await Promise.all([intraday(t, d, i as "1m"), haltsOn(d)]);
  if (!c?.bars.length) return Response.json({ error: i === "1m" ? "1분봉은 최근 7일까지만 있어요. 5분봉으로 봐 주세요." : "차트 자료를 찾지 못했어요." }, { status: 404 });
  return Response.json({ bars: c.bars, prevClose: c.meta.chartPreviousClose ?? null, halts: (hs ?? []).filter(h => h.ticker === t).map(h => ({ halt: h.halt, resume: h.resume, code: h.code })) });
}
