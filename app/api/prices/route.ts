// GET /api/prices?t=KNRX,AAPL → 보유 종목 지금 가격(Yahoo)과 오늘 거래정지 여부 (매매일지용)
import { haltsOn } from "@/lib/halts";
import { getJson, pool } from "@/lib/http";
import { lastTradingDay } from "@/lib/time";

type Chart = { chart?: { result?: Array<{ meta: { regularMarketPrice?: number; chartPreviousClose?: number; longName?: string; shortName?: string } }> } };

export async function GET(req: Request) {
  const ts = [...new Set((new URL(req.url).searchParams.get("t") ?? "").toUpperCase().split(",").map(x => x.trim()).filter(x => /^[A-Z.\-]{1,8}$/.test(x)))].slice(0, 40);
  if (!ts.length) return Response.json({});
  const [quotes, hs] = await Promise.all([
    pool(ts, 8, async t => {
      const j = await getJson<Chart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=1d&range=5d`, { revalidate: 60, timeout: 7000 });
      const m = j?.chart?.result?.[0]?.meta;
      return [t, m?.regularMarketPrice ? { price: m.regularMarketPrice, prev: m.chartPreviousClose ?? null, name: m.longName ?? m.shortName ?? "" } : null] as const;
    }),
    haltsOn(lastTradingDay()).catch(() => null),
  ]);
  const now = Date.now(), out: Record<string, unknown> = {};
  for (const [t, q] of quotes) {
    const ev = (hs ?? []).filter(h => h.ticker === t), last = ev.at(-1);
    out[t] = { ...(q ?? { price: null, prev: null, name: "" }), halts: ev.length, haltedNow: !!last && (!last.resume || new Date(last.resume).getTime() > now), haltLabel: last?.label ?? null };
  }
  return Response.json(out);
}
