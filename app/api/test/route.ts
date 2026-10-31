// GET /api/test → 자료 출처 연결 시험 (글자로)
import { haltsOn } from "@/lib/halts";
import { pastMovers, polygonReady, todayMovers } from "@/lib/movers";
import { lastTradingDay, shiftTradingDay, todayEt } from "@/lib/time";
import { dayStats, intraday } from "@/lib/yahoo";

export async function GET() {
  const out: string[] = [`서버 위치: ${process.env.VERCEL_REGION ?? "?"} · 오늘(ET) ${todayEt()}`];
  const last = lastTradingDay(), prev = shiftTradingDay(last, -1);
  const t0 = await haltsOn(todayEt()); out.push(`[거래정지 오늘] ${t0 == null ? "실패" : `${t0.length}건`}`);
  const t1 = await haltsOn(prev); out.push(`[거래정지 ${prev}] ${t1 == null ? "실패" : `${t1.length}건 ${t1.slice(0, 3).map(h => `${h.ticker} ${h.code}`).join(", ")}`}`);
  const m = await todayMovers(); out.push(`[나스닥 종목표] ${m == null ? "실패" : `+20% ${m.length}종목 ${m.slice(0, 3).map(x => `${x.ticker} +${x.rate}%`).join(", ")}`}`);
  out.push(`[Polygon] ${polygonReady() ? ((await pastMovers(prev))?.length ?? "실패") + "종목" : "키 없음"}`);
  const s = await dayStats("AAPL", prev); out.push(`[Yahoo 일봉 AAPL ${prev}] ${s ? `${s.price} (${s.rate}%)` : "실패"}`);
  const c = await intraday("AAPL", prev, "5m"); out.push(`[Yahoo 5분봉] ${c ? `${c.bars.length}개` : "실패"}`);
  return new Response(out.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
