// GET /api/quote?t=KNRX&d=2026-10-30 → 검색한 종목의 그날 값·정지 기록 (목록에 없는 종목용)
import { haltsOn } from "@/lib/halts";
import { dayStats } from "@/lib/yahoo";
import { todayEt } from "@/lib/time";
import type { Row } from "@/lib/types";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, t = (q.get("t") ?? "").toUpperCase().trim(), d = q.get("d") ?? "";
  if (!/^[A-Z.\-]{1,8}$/.test(t) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return Response.json({ error: "티커나 날짜가 맞지 않아요." }, { status: 400 });
  const [s, hs] = await Promise.all([dayStats(t, d), haltsOn(d)]);
  if (!s) return Response.json({ error: `${t} 시세를 찾지 못했어요. 티커를 확인해 주세요.` }, { status: 404 });
  const ev = (hs ?? []).filter(h => h.ticker === t);
  const row: Row = {
    ticker: t, name: s.meta.longName ?? s.meta.shortName ?? "", market: s.meta.fullExchangeName ?? "",
    price: s.price ?? s.meta.regularMarketPrice ?? null, rate: s.rate, dollarVol: s.dollarVol, volRatio: s.volRatio,
    halts: ev.map(({ code, label, plain, kind, halt, resume }) => ({ code, label, plain, kind, halt, resume })), haltedNow: false,
    after: d < todayEt() ? { next: s.next, now: s.now } : undefined,
  };
  return Response.json(row);
}
