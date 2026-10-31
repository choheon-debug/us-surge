// GET /api/test → 자료 출처 연결 시험 (글자로)
import { haltsOn } from "@/lib/halts";
import { getText } from "@/lib/http";
import { pastMovers, polygonReady, todayMovers } from "@/lib/movers";
import { lastTradingDay, shiftTradingDay, todayEt } from "@/lib/time";
import { dayStats, intraday } from "@/lib/yahoo";

export async function GET() {
  const out: string[] = [`서버 위치: ${process.env.VERCEL_REGION ?? "?"} · 오늘(ET) ${todayEt()}`];
  const last = lastTradingDay(), prev = shiftTradingDay(last, -1);
  for (const u of ["https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts", `https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts&haltdate=${prev.slice(5, 7)}${prev.slice(8)}${prev.slice(0, 4)}`]) {
    const x = await getText(u, { timeout: 12_000 });
    out.push(`[RSS 원문 ${u.includes("haltdate") ? prev : "오늘"}] ${x == null ? "실패" : `${x.length}자 · item ${(x.match(/<item/gi) ?? []).length}개\n${x.replace(/\s+/g, " ").slice(x.search(/<item/i) > 0 ? x.search(/<item/i) : 0, (x.search(/<item/i) > 0 ? x.search(/<item/i) : 0) + 700)}`}`);
  }
  const tm = async <T,>(f: () => Promise<T>) => { const a = Date.now(); const v = await f(); return [v, ((Date.now() - a) / 1000).toFixed(1) + "초"] as const; };
  const [t0, s0] = await tm(() => haltsOn(todayEt())); out.push(`  (${s0})`); out.push(`[거래정지 오늘] ${t0 == null ? "실패" : `${t0.length}건`}`);
  const [t1, s1] = await tm(() => haltsOn(prev)); out.push(`  (${s1})`); out.push(`[거래정지 ${prev}] ${t1 == null ? "실패" : `${t1.length}건 ${t1.slice(0, 3).map(h => `${h.ticker} ${h.code}`).join(", ")}`}`);
  const [m, s2] = await tm(() => todayMovers()); out.push(`  (${s2})`); out.push(`[나스닥 종목표] ${m == null ? "실패" : `+20% ${m.length}종목 ${m.slice(0, 3).map(x => `${x.ticker} +${x.rate}%`).join(", ")}`}`);
  out.push(`[Polygon] ${polygonReady() ? ((await pastMovers(prev))?.length ?? "실패") + "종목" : "키 없음"}`);
  const [s, s3] = await tm(() => dayStats("AAPL", prev)); out.push(`  (${s3})`); out.push(`[Yahoo 일봉 AAPL ${prev}] ${s ? `${s.price} (${s.rate}%)` : "실패"}`);
  const c = await intraday("AAPL", prev, "5m"); out.push(`[Yahoo 5분봉] ${c ? `${c.bars.length}개` : "실패"}`);
  return new Response(out.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
