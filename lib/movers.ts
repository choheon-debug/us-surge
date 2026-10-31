// 급등주 목록: 오늘은 나스닥 종목표(키 없음), 지난 날짜는 Polygon 일별 전체 시세(무료 키 POLYGON_API_KEY)
import { getJson } from "./http";
import { shiftTradingDay, todayEt } from "./time";

export type Mover = { ticker: string; name: string; price: number; rate: number; volume: number; dollarVol: number; marketCap: number | null; volRatio: number | null };
const MIN_RATE = 20, MIN_DOLLAR = 1_000_000;

/** 오늘: 나스닥 종목표 (모든 상장 종목의 지금 값·등락률). 2분 저장 */
let moversCache: { at: number; v: Mover[] } | null = null;
export async function todayMovers(): Promise<Mover[] | null> {
  if (moversCache && Date.now() - moversCache.at < 120_000) return moversCache.v;
  type R = { data?: { rows?: { symbol: string; name: string; lastsale: string; pctchange: string; volume: string; marketCap: string }[] } };
  const j = await getJson<R>("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25000&download=true",
    { headers: { Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" }, timeout: 15_000 });
  const rows = j?.data?.rows;
  if (!rows) return null;
  const num = (s: string) => Number(String(s).replace(/[$,%]/g, ""));
  const v = rows.map(r => {
    const price = num(r.lastsale), volume = num(r.volume);
    return { ticker: r.symbol.trim().toUpperCase(), name: r.name, price, rate: num(r.pctchange), volume, dollarVol: price * volume, marketCap: num(r.marketCap) || null, volRatio: null };
  }).filter(m => m.rate >= MIN_RATE && m.dollarVol >= MIN_DOLLAR && Number.isFinite(m.price)).sort((a, b) => b.rate - a.rate);
  moversCache = { at: Date.now(), v };
  return v;
}

type G = { results?: { T: string; c: number; v: number; o: number }[] };
const key = () => (process.env.POLYGON_API_KEY || "").trim();
export const polygonReady = () => !!key();
async function grouped(date: string) {
  const j = await getJson<G>(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${key()}`,
    { revalidate: date < todayEt() ? 30 * 86400 : 300 });
  return j?.results ? new Map(j.results.map(r => [r.T, r])) : null;
}

/** 지난 날짜: 그날·전날 전체 시세로 +20% 이상 (거래대금 $1M 이상) */
export async function pastMovers(date: string): Promise<Mover[] | null> {
  if (!polygonReady()) return null;
  const [cur, prev] = await Promise.all([grouped(date), grouped(shiftTradingDay(date, -1))]);
  if (!cur || !prev) return null;
  const out: Mover[] = [];
  for (const [t, r] of cur) {
    const p = prev.get(t);
    if (!p?.c || !/^[A-Z.]{1,6}$/.test(t)) continue;
    const rate = Math.round(((r.c - p.c) / p.c) * 1000) / 10, dollarVol = r.c * r.v;
    if (rate >= MIN_RATE && dollarVol >= MIN_DOLLAR) out.push({ ticker: t, name: "", price: r.c, rate, volume: r.v, dollarVol, marketCap: null, volRatio: p.v ? Math.round((r.v / p.v - 1) * 100) : null });
  }
  return out.sort((a, b) => b.rate - a.rate);
}
