// GET /api/fx → 원/달러 환율 (Yahoo KRW=X, 10분 저장)
import { getJson } from "@/lib/http";

type Chart = { chart?: { result?: Array<{ meta: { regularMarketPrice?: number; regularMarketTime?: number } }> } };

export async function GET() {
  const j = await getJson<Chart>("https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=5d", { revalidate: 600, timeout: 7000 });
  const m = j?.chart?.result?.[0]?.meta;
  if (!m?.regularMarketPrice) return Response.json({ error: "환율을 가져오지 못했어요." }, { status: 502 });
  return Response.json({ fx: Math.round(m.regularMarketPrice * 100) / 100, at: m.regularMarketTime ? m.regularMarketTime * 1000 : Date.now() });
}
