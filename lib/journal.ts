// 📒 매매일지 계산: 평균 단가 방식으로 매도 손익, 보유 종목, 통계. 모든 금액은 달러($)
export type Side = "buy" | "sell";
export type Trade = {
  id: string; date: string; time?: string;   // 미국 동부시간 날짜 YYYY-MM-DD, 시각 HH:MM (선택)
  ticker: string; side: Side; price: number; qty: number; fee: number;
  strategy?: string; mood?: string; stop?: number | null; target?: number | null;
  memo?: string; photo?: string;              // 사진은 작게 줄인 JPEG (data URL)
  fx?: number;                                // 그때 환율 (원/달러)
  at: number;                                 // 넣은 순서
};
export type Review = { week: string; good: string; bad: string; rule: string };
export type JSettings = { feeRate: number; fx: number; fxAuto: boolean; strategies: string[] };   // fx: 직접 넣은 환율 (fxAuto면 자동 환율을 씀)
export const DEFAULT_SETTINGS: JSettings = { feeRate: 0.25, fx: 0, fxAuto: true, strategies: ["돌파", "급등 눌림", "거래정지 재개", "뉴스", "물타기", "스윙"] };
export const MOODS = ["😌 차분", "😨 조급", "😤 복수", "🤑 욕심"];

/** 매도 한 건의 결과 */
export type Closed = { trade: Trade; cost: number; pnl: number; pct: number; strategy?: string; mood?: string; stop?: number | null; held: number; cycle: string };
/** 보유 중인 종목 */
export type Position = { cycle: string; ticker: string; qty: number; avg: number; cost: number; since: string; stop?: number | null; target?: number | null; strategy?: string; trades: Trade[] };

// 같은 날은 둘 다 시각이 있으면 시각 순, 아니면 기록한 순서 (시각을 안 넣은 매도가 매수보다 앞서지 않게)
const order = (a: Trade, b: Trade) => a.date.localeCompare(b.date) || (a.time && b.time ? a.time.localeCompare(b.time) : 0) || a.at - b.at;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);

/** 평균 단가 방식: 살 때 평단을 다시 계산하고, 팔 때는 (판 금액 − 수수료) − 평단 × 수량을 손익으로 */
export function compute(trades: Trade[]) {
  const closed: Closed[] = [], pos = new Map<string, Position>();
  for (const t of [...trades].sort(order)) {
    let p = pos.get(t.ticker);
    if (t.side === "buy") {
      if (!p) { p = { cycle: t.id, ticker: t.ticker, qty: 0, avg: 0, cost: 0, since: t.date, strategy: t.strategy, trades: [] }; pos.set(t.ticker, p); }
      p.cost += t.price * t.qty + t.fee; p.qty += t.qty; p.avg = p.cost / p.qty;
      if (t.stop != null) p.stop = t.stop;
      if (t.target != null) p.target = t.target;
      p.trades.push(t);
    } else {
      const q = Math.min(t.qty, p?.qty ?? 0);
      const opening = p?.trades.find(x => x.side === "buy");
      const cost = (p?.avg ?? 0) * q, pnl = t.price * t.qty - t.fee - cost;
      closed.push({ trade: t, cost, pnl: q ? pnl : 0, pct: cost ? (pnl / cost) * 100 : 0, strategy: opening?.strategy ?? t.strategy, mood: opening?.mood ?? t.mood, stop: p?.stop ?? null, held: p ? days(p.since, t.date) : 0, cycle: p?.cycle ?? t.id });
      if (p) {
        p.trades.push(t); p.qty -= q; p.cost = p.avg * p.qty;
        if (p.qty <= 1e-9) pos.delete(t.ticker);
      }
    }
  }
  return { closed, positions: [...pos.values()].sort((a, b) => b.cost - a.cost) };
}

/**
 * 매매 1건 = 한 번 사서(나눠 사도) 다 팔 때까지. 나눠 판 매도들을 하나로 합친다.
 * 아직 다 안 판 매매도 판 부분까지의 손익으로 들어간다. 날짜는 마지막 매도일.
 */
export function rounds(closed: Closed[]): Closed[] {
  const m = new Map<string, Closed>();
  for (const c of closed) {
    const r = m.get(c.cycle);
    if (!r) { m.set(c.cycle, { ...c }); continue; }
    r.pnl += c.pnl; r.cost += c.cost; r.pct = r.cost ? (r.pnl / r.cost) * 100 : 0; r.trade = c.trade; r.held = c.held;
  }
  return [...m.values()];
}

export function stats(closed: Closed[]) {
  const wins = closed.filter(c => c.pnl > 0), losses = closed.filter(c => c.pnl < 0);
  const avg = (l: Closed[]) => (l.length ? l.reduce((a, c) => a + c.pct, 0) / l.length : 0);
  const aw = avg(wins), al = avg(losses);
  return {
    n: closed.length, pnl: closed.reduce((a, c) => a + c.pnl, 0),
    winRate: closed.length ? wins.length / closed.length : 0,
    avgWin: aw, avgLoss: al, ratio: al ? aw / Math.abs(al) : null,
  };
}

/** 이름(전략·마음)별로 묶은 성적 */
export function groupBy(closed: Closed[], key: (c: Closed) => string | undefined) {
  const m = new Map<string, Closed[]>();
  for (const c of closed) { const k = key(c) || "기록 없음"; m.set(k, [...(m.get(k) ?? []), c]); }
  return [...m.entries()].map(([k, l]) => ({ k, ...stats(l) })).sort((a, b) => b.n - a.n);
}

/** 손절가를 지킨 손실 vs 안 지킨 손실 (손절가를 넣은 매매만) */
export function stopCheck(closed: Closed[]) {
  const l = closed.filter(c => c.pnl < 0 && c.stop);
  const kept = l.filter(c => c.trade.price >= c.stop! * 0.98), broke = l.filter(c => c.trade.price < c.stop! * 0.98);
  const a = (x: Closed[]) => (x.length ? x.reduce((s, c) => s + c.pct, 0) / x.length : null);
  return { kept: kept.length, broke: broke.length, keptAvg: a(kept), brokeAvg: a(broke) };
}

/** 그 주의 일요일 (ET 날짜 기준) */
export function weekStart(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
export const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** $ 금액 (부호 포함 선택) */
export function usd(x: number, sign = false) {
  const a = Math.abs(x), s = sign ? (x > 0 ? "+" : x < 0 ? "−" : "") : x < 0 ? "−" : "";
  return `${s}$${a >= 1000 ? Math.round(a).toLocaleString("en-US") : a.toFixed(2).replace(/\.00$/, "")}`;
}
/** 원화 함께 (설정에서 환율을 넣었을 때만): " (약 +12.5만 원)" */
export function krwToo(x: number, fx: number, sign = false) {
  if (!fx) return "";
  const v = x * fx, a = Math.abs(v), s = sign ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "";
  return ` (약 ${s}${a >= 1e4 ? `${(a / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: a >= 1e6 ? 0 : 1 })}만` : Math.round(a).toLocaleString("ko-KR")} 원)`;
}
export const px = (p: number) => `$${p < 1 ? p.toFixed(4) : p.toFixed(2)}`;
