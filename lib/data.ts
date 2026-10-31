// 하루 자료 묶기: 거래정지 목록 + 급등주 + 가격·그 뒤 결과
import { haltsOn, type HaltItem } from "./halts";
import { pastMovers, polygonReady, todayMovers, type Mover } from "./movers";
import { pool } from "./http";
import { etHm, isTradingDay, marketOpen, todayEt } from "./time";
import { dayStats } from "./yahoo";
import type { Day, Row } from "./types";

const cache = new Map<string, { at: number; d: Day }>();

export async function day(date: string): Promise<Day> {
  const today = date === todayEt(), ttl = today ? 30_000 : 6 * 3600_000;
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < ttl) return hit.d;
  const notes: string[] = [];
  if (!isTradingDay(date) || date > todayEt()) return { date, live: false, asOf: "", halts: [], gainers: [], notes };

  const [hs, mv] = await Promise.all([haltsOn(date), today ? todayMovers() : pastMovers(date)]);
  if (hs == null) notes.push("나스닥 거래정지 목록을 가져오지 못했어요.");
  if (mv == null) notes.push(today ? "오늘 급등주 목록(나스닥 종목표)을 가져오지 못했어요." : polygonReady() ? "지난 날짜 급등주(Polygon)를 가져오지 못했어요." : "지난 날짜의 급등주 전체 목록은 Polygon 무료 키(POLYGON_API_KEY)를 넣으면 나와요. 지금은 거래정지 종목만 보여요.");

  // 종목별로 정지 묶기
  const byT = new Map<string, HaltItem[]>();
  for (const h of hs ?? []) byT.set(h.ticker, [...(byT.get(h.ticker) ?? []), h]);
  const movers = new Map((mv ?? []).map(m => [m.ticker, m]));
  const now = Date.now();
  const mkRow = (t: string, m?: Mover): Row => {
    const ev = byT.get(t) ?? [], last = ev.at(-1);
    return {
      ticker: t, name: m?.name || ev[0]?.name || "", market: ev[0]?.market ?? "",
      price: m?.price ?? null, rate: m?.rate ?? null, dollarVol: m?.dollarVol ?? null, volRatio: m?.volRatio ?? null,
      halts: ev.map(({ code, label, plain, kind, halt, resume }) => ({ code, label, plain, kind, halt, resume })),
      haltedNow: today && !!last && (!last.resume || new Date(last.resume).getTime() > now),
    };
  };
  const haltRows = [...byT.keys()].map(t => mkRow(t, movers.get(t)));
  const gainRows = [...movers.values()].slice(0, 60).map(m => mkRow(m.ticker, m));

  // 가격·등락률·그 뒤 결과는 Yahoo 일봉으로 채운다 (정지 종목은 가격이 없을 수 있다)
  const need = [...new Map([...haltRows, ...gainRows].map(r => [r.ticker, r])).values()].slice(0, 70);
  const stats = new Map((await pool(need, 14, async r => [r.ticker, await dayStats(r.ticker, date).catch(() => null)] as const)));
  for (const r of [...haltRows, ...gainRows]) {
    const s = stats.get(r.ticker);
    if (!s) continue;
    r.price ??= s.price; r.rate ??= s.rate; r.dollarVol ??= s.dollarVol; r.volRatio ??= s.volRatio;
    if (!r.name) r.name = s.meta.longName ?? s.meta.shortName ?? "";
    if (!r.market && s.meta.fullExchangeName) r.market = s.meta.fullExchangeName.replace(/Nasdaq\w*/i, "NASDAQ").replace("NYSEArca", "NYSE Arca");
    if (!today) r.after = { next: s.next, now: s.now };
  }
  const sortRows = (l: Row[]) => l.sort((a, b) => (b.rate ?? -999) - (a.rate ?? -999));
  const d: Day = { date, live: today && marketOpen(), asOf: today ? etHm() : "16:00", halts: sortRows(haltRows), gainers: sortRows(gainRows), notes };
  cache.set(date, { at: Date.now(), d });
  return d;
}

/** 달력: 날짜별 거래정지 종목 수 */
export async function monthHalts(month: string) {
  const days: string[] = [];
  for (let i = 1; i <= 31; i++) {
    const d = `${month}-${String(i).padStart(2, "0")}`;
    if (new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d && isTradingDay(d) && d <= todayEt()) days.push(d);
  }
  const lists = await pool(days, 6, async d => [d, await haltsOn(d)] as const);
  const out: Record<string, number> = {};
  for (const [d, l] of lists) if (l) out[d] = new Set(l.map(h => h.ticker)).size;
  return out;
}
