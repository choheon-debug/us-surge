// Yahoo 시세 (키 없음): 일봉(급등일·다음 날·지금 비교), 분봉(차트), 회사 기본 정보
import { getJson } from "./http";
import { etDate } from "./time";
import type { Bar } from "./types";

type Chart = { chart?: { result?: Array<{
  meta: { regularMarketPrice?: number; chartPreviousClose?: number; regularMarketTime?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number; fullExchangeName?: string; longName?: string; shortName?: string; regularMarketVolume?: number };
  timestamp?: number[]; indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
}> } };

async function chart(ticker: string, q: string, revalidate?: number) {
  const j = await getJson<Chart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?${q}`, { revalidate, timeout: 7000 });
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const k = r.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = (r.timestamp ?? []).flatMap((t, i) => {
    const c = k.close?.[i];
    return c == null ? [] : [{ t: t * 1000, o: k.open?.[i] ?? c, h: k.high?.[i] ?? c, l: k.low?.[i] ?? c, c, v: k.volume?.[i] ?? 0 }];
  });
  return { meta: r.meta, bars };
}
const sec = (date: string, addDays = 0) => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000) + addDays * 86400;

/** 일봉: date 앞 10일 ~ 오늘 (지난 날짜는 1시간 저장) */
export async function daily(ticker: string, date: string) {
  return chart(ticker, `interval=1d&period1=${sec(date, -10)}&period2=${Math.floor(Date.now() / 1000) + 86400}`, 3600);
}

/** 급등일 종가·등락률·거래량 비율 + 그 뒤 결과 (일봉으로) */
export async function dayStats(ticker: string, date: string) {
  const c = await daily(ticker, date);
  if (!c) return null;
  const bars = c.bars, i = bars.findIndex(b => etDate(b.t) === date);
  if (i < 0) return { price: null, rate: null, dollarVol: null, volRatio: null, next: null, now: null, meta: c.meta };
  const b = bars[i], p = bars[i - 1], n = bars[i + 1], last = bars.at(-1)!;
  const pct = (a: number, z: number) => Math.round(((a - z) / z) * 1000) / 10;
  return {
    price: b.c, rate: p ? pct(b.c, p.c) : null, dollarVol: b.c * b.v, volRatio: p?.v ? Math.round((b.v / p.v - 1) * 100) : null,
    next: n ? pct(n.c, b.c) : null, now: i < bars.length - 1 ? pct(last.c, b.c) : null, meta: c.meta,
  };
}

/** 분봉 차트 (1분은 최근 7일 안쪽, 5분은 60일, 그 밖은 일봉). 프리·애프터 포함 */
export async function intraday(ticker: string, date: string, interval: "1m" | "5m" | "1d") {
  if (interval === "1d") return chart(ticker, `interval=1d&range=6mo`, 3600);
  return chart(ticker, `interval=${interval}&period1=${sec(date, -1)}&period2=${sec(date, 2)}&includePrePost=true`, 120)
    .then(c => c && { ...c, bars: c.bars.filter(b => etDate(b.t) === date) });
}
