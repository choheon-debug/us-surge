"use client";
// 📒 매매일지: 달력(실현 손익) · 보유(+관심) · 통계(전략·마음별) · 복기(주간) · ⚙ 설정·백업
import { useEffect, useRef, useState } from "react";
import { isHoliday, prettyDate, signed, todayEt } from "@/lib/time";
import { addDays, compute, groupBy, krwToo, px, stats, stopCheck, usd, weekStart, type Closed, type JSettings, type Position, type Review, type Trade } from "@/lib/journal";
import type { WatchItem } from "./App";

export type Live = Record<string, { price: number | null; prev: number | null; name: string; halts: number; haltedNow: boolean; haltLabel: string | null }>;
type Props = {
  trades: Trade[]; reviews: Record<string, Review>; setReviews: (f: (p: Record<string, Review>) => Record<string, Review>) => void;
  settings: JSettings; setSettings: (s: JSettings) => void; fx: number; liveFx: number | null;
  watch: WatchItem[]; onRemoveWatch: (t: string) => void; onOpenTicker: (t: string, date: string) => void;
  onNew: (init?: Partial<Trade>) => void; onEdit: (t: Trade) => void; restore: (j: unknown) => void; backup: () => unknown; say: (t: string) => void;
};
const SUBS = [["cal", "📅 달력"], ["hold", "💼 보유"], ["stat", "📊 통계"], ["rev", "📝 복기"]] as const;
const pnlCls = (x: number) => (x > 0 ? "up" : x < 0 ? "dn" : "");

export default function Journal(p: Props) {
  const [sub, setSub] = useState<(typeof SUBS)[number][0]>("cal");
  const [showSet, setShowSet] = useState(false);
  const { closed, positions } = compute(p.trades);
  const [live, setLive] = useState<Live>({});
  const tickers = [...new Set([...positions.map(x => x.ticker), ...p.watch.map(w => w.ticker)])].sort().join(",");
  useEffect(() => {
    if (!tickers) return;
    fetch(`/api/prices?t=${tickers}`).then(r => r.json()).then(setLive).catch(() => {});
  }, [tickers]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <div className="card grid flex-1 grid-cols-4 gap-1 !rounded-full !p-1">
          {SUBS.map(([k, l]) => <button key={k} onClick={() => setSub(k)} className={`rounded-full py-1.5 text-[0.8rem] font-bold ${sub === k ? "bg-[var(--acc2)] text-[var(--acc)]" : "muted"}`}>{l}</button>)}
        </div>
        <button className="card !rounded-full !px-3 !py-0" aria-label="일지 설정" onClick={() => setShowSet(!showSet)}>⚙</button>
      </div>
      {showSet && <Settings {...p} onClose={() => setShowSet(false)} />}
      <p className="text-center text-xs muted">환율 {p.fx ? `${p.fx.toLocaleString()}원/$` : "없음"}{p.settings.fxAuto ? (p.liveFx ? " · 자동" : " · 자동 환율을 못 가져옴") : " · 직접 넣음"}</p>
      {sub === "cal" && <CalTab {...p} closed={closed} />}
      {sub === "hold" && <HoldTab {...p} positions={positions} live={live} />}
      {sub === "stat" && <StatTab closed={closed} fx={p.fx} />}
      {sub === "rev" && <RevTab {...p} closed={closed} />}
      <button className="btn btn-fill w-full" onClick={() => p.onNew()}>＋ 매매 기록하기</button>
    </div>
  );
}

/* ---------- 📅 달력: 날짜별 실현 손익 ---------- */
function CalTab({ trades, closed, fx, onEdit, onOpenTicker }: Props & { closed: Closed[] }) {
  const [month, setMonth] = useState(todayEt().slice(0, 7));
  const [date, setDate] = useState(todayEt());
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mc = closed.filter(c => c.trade.date.startsWith(month)), s = stats(mc);
  const dayPnl = new Map<string, number>(), dayBuy = new Set(trades.filter(t => t.side === "buy").map(t => t.date));
  for (const c of mc) dayPnl.set(c.trade.date, (dayPnl.get(c.trade.date) ?? 0) + c.pnl);
  const move = (d: number) => setMonth(new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7));
  const list = trades.filter(t => t.date === date).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.at - b.at);
  const cByTrade = new Map(closed.map(c => [c.trade.id, c]));
  const dp = list.reduce((a, t) => a + (cByTrade.get(t.id)?.pnl ?? 0), 0);
  const short = (x: number) => `${x > 0 ? "+" : "−"}$${Math.abs(x) >= 1000 ? `${(Math.abs(x) / 1000).toFixed(1)}k` : Math.round(Math.abs(x))}`;
  return <>
    <section className="card">
      <div className="flex items-center justify-between">
        <button onClick={() => move(-1)} className="h-8 w-8 rounded-lg bg-[#f1f2f4] font-bold" aria-label="이전 달">‹</button>
        <b>{y}년 {m}월 실현 손익</b>
        <button onClick={() => move(1)} className="h-8 w-8 rounded-lg bg-[#f1f2f4] font-bold" aria-label="다음 달">›</button>
      </div>
      <div className={`mt-1 text-center text-[1.7rem] font-extrabold num ${pnlCls(s.pnl)}`}>{usd(s.pnl, true)}<span className="text-base">{krwToo(s.pnl, fx, true)}</span></div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        {[["매도", `${s.n}회`], ["승률", s.n ? `${Math.round(s.winRate * 100)}%` : "–"], ["손익비", s.ratio != null ? s.ratio.toFixed(1) : "–"]].map(([k, v]) =>
          <div key={k} className="rounded-xl bg-[#f4f5f7] py-1"><div className="text-[0.7rem] muted">{k}</div><b className="num">{v}</b></div>)}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {"일월화수목금토".split("").map((w, i) => <div key={w} className={`text-xs font-bold ${i === 0 ? "text-[var(--red)]" : i === 6 ? "text-[#2f6fd6]" : "muted"}`}>{w}</div>)}
        {Array.from({ length: first }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, "0")}`, wd = (first + i) % 7, v = dayPnl.get(d), sel = d === date;
          return <button key={d} onClick={() => setDate(d)} className={`flex h-12 flex-col items-center justify-center rounded-xl text-[0.9rem] font-semibold leading-tight
            ${sel ? "bg-[var(--acc)] text-white" : v ? (v > 0 ? "bg-[var(--up2)]" : "bg-[#e8effd]") : ""} ${!sel && (wd === 0 || isHoliday(d)) ? "text-[var(--red)]" : !sel && wd === 6 ? "text-[#2f6fd6]" : ""}`}>
            {i + 1}
            {v != null ? <span className={`text-[0.58rem] font-extrabold ${sel ? "" : pnlCls(v)}`}>{short(v)}</span> : dayBuy.has(d) ? <span className={`text-[0.58rem] ${sel ? "" : "muted"}`}>매수</span> : null}
          </button>;
        })}
      </div>
      <p className="mt-2 text-xs muted">빨강 = 이익 · 파랑 = 손실 · 날짜를 누르면 그날 매매 (미국 동부시간 날짜)</p>
    </section>
    <section className="card">
      <div className="flex items-baseline justify-between"><b>{prettyDate(date)}</b><span className="text-xs muted">{list.length}건{dp ? <> · 실현 <b className={pnlCls(dp)}>{usd(dp, true)}</b></> : ""}</span></div>
      {!list.length && <p className="mt-1 text-sm muted">이 날은 매매 기록이 없어요.</p>}
      {[...new Set(list.map(t => t.ticker))].map(tk => <TickerGroup key={tk} ticker={tk} list={list.filter(t => t.ticker === tk)} cmap={cByTrade} fx={fx} onEdit={onEdit} onOpen={() => onOpenTicker(tk, date)} />)}
    </section>
  </>;
}

/** 같은 종목은 한 카드로: 위에 종목·그날 손익, 아래에 매수·매도 줄 */
function TickerGroup({ ticker, list, cmap, fx, onEdit, onOpen }: { ticker: string; list: Trade[]; cmap: Map<string, Closed>; fx: number; onEdit: (t: Trade) => void; onOpen: () => void }) {
  const pnl = list.reduce((a, t) => a + (cmap.get(t.id)?.pnl ?? 0), 0), hasSell = list.some(t => t.side === "sell");
  const tags = [...new Set(list.flatMap(t => [t.strategy, t.mood]).filter(Boolean))] as string[];
  const memo = list.map(t => t.memo).filter(Boolean).join(" · ");
  return (
    <div className="border-t border-[var(--line)] py-2.5 first-of-type:border-0">
      <div className="flex items-center gap-2.5">
        <button onClick={onOpen} className="grid h-10 w-12 shrink-0 place-items-center rounded-xl bg-[#6366f1] text-[0.72rem] font-extrabold text-white">{ticker.slice(0, 5)}</button>
        <div className="min-w-0 flex-1"><b>{ticker}</b> <span className="text-xs muted">{list.length}건</span>
          <div className="flex flex-wrap gap-1">{tags.map(x => <span key={x} className={`tag ${/[😌😨😤🤑]/u.test(x) ? "tag-a" : "tag-g"}`}>{x}</span>)}{list.some(t => t.photo) && <span className="text-xs">📷</span>}</div></div>
        {hasSell && <div className="shrink-0 text-right"><b className={`num ${pnlCls(pnl)}`}>{usd(pnl, true)}</b>{fx > 0 && <div className="text-[0.65rem] muted">{krwToo(pnl, fx, true).replace(/[()]/g, "").trim()}</div>}</div>}
      </div>
      <div className="mt-1.5 space-y-1">
        {list.map(t => { const c = cmap.get(t.id);
          return <button key={t.id} onClick={() => onEdit(t)} className="flex w-full items-center gap-1.5 rounded-lg bg-[#f6f7f9] px-2 py-1 text-left text-xs">
            <span className={`tag ${t.side === "buy" ? "tag-r" : "tag-n"}`}>{t.side === "buy" ? "매수" : "매도"}</span>
            <span className="min-w-0 flex-1 truncate num">{t.time ? <span className="muted">{t.time} </span> : null}<b>{px(t.price)}</b> × {t.qty.toLocaleString()}주</span>
            {c && <b className={`shrink-0 ${pnlCls(c.pnl)}`}>{signed(c.pct)}</b>}
          </button>; })}
        {memo && <p className="text-xs muted">📝 {memo}</p>}
      </div>
    </div>
  );
}

export function TradeRow({ t, c, fx, onEdit, onOpen }: { t: Trade; c?: Closed; fx: number; onEdit: () => void; onOpen?: () => void }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-[var(--line)] py-2.5 first-of-type:border-0">
      <button onClick={onOpen} className={`grid h-10 w-12 shrink-0 place-items-center rounded-xl text-[0.72rem] font-extrabold text-white ${t.side === "buy" ? "bg-[var(--up)]" : "bg-[var(--dn)]"}`}>{t.ticker.slice(0, 5)}</button>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1"><b>{t.ticker}</b><span className={`tag ${t.side === "buy" ? "tag-r" : "tag-n"}`}>{t.side === "buy" ? "매수" : "매도"}</span>
          {t.strategy && <span className="tag tag-g">{t.strategy}</span>}{t.mood && <span className="tag tag-a">{t.mood}</span>}{t.photo && <span className="text-xs">📷</span>}</div>
        <div className="truncate text-xs muted">{t.time ? `${t.time} · ` : ""}{t.qty.toLocaleString()}주 · {px(t.price)} · {usd(t.side === "buy" ? t.price * t.qty + t.fee : t.price * t.qty - t.fee)}{t.memo ? ` · ${t.memo}` : ""}</div>
      </button>
      {c ? <div className="shrink-0 text-right"><b className={`num ${pnlCls(c.pnl)}`}>{usd(c.pnl, true)}</b><div className={`text-xs ${pnlCls(c.pnl)}`}>{signed(c.pct)}</div>
        {fx > 0 && <div className="text-[0.65rem] muted">{krwToo(c.pnl, t.fx || fx, true).replace(/[()]/g, "").trim()}</div>}</div> : null}
    </div>
  );
}

/* ---------- 💼 보유 + ⭐ 관심 ---------- */
function HoldTab({ positions, live, fx, onOpenTicker, onNew, watch, onRemoveWatch }: Props & { positions: Position[]; live: Live }) {
  const val = positions.map(x => { const lp = live[x.ticker]?.price; return { x, lp, v: lp != null ? lp * x.qty : null }; });
  const cost = positions.reduce((a, x) => a + x.cost, 0), known = val.filter(z => z.v != null), value = known.reduce((a, z) => a + z.v!, 0), kc = known.reduce((a, z) => a + z.x.cost, 0);
  return <>
    <section className="card">
      <div className="flex items-baseline justify-between"><b>💼 보유 종목 {positions.length}개</b><span className="text-xs muted">지금 가격: Yahoo (지연될 수 있음)</span></div>
      {!!positions.length && <div className="mt-2 grid grid-cols-2 gap-1.5 text-center">
        <div className="rounded-xl bg-[#f4f5f7] py-1.5"><div className="text-[0.7rem] muted">투자금</div><b className="num">{usd(cost)}</b><div className="text-[0.65rem] muted">{krwToo(cost, fx)}</div></div>
        <div className="rounded-xl bg-[#f4f5f7] py-1.5"><div className="text-[0.7rem] muted">평가 손익</div><b className={`num ${pnlCls(value - kc)}`}>{known.length ? usd(value - kc, true) : "–"}</b>
          <div className={`text-[0.65rem] ${pnlCls(value - kc)}`}>{kc ? signed(((value - kc) / kc) * 100) : ""}{krwToo(value - kc, fx, true)}</div></div>
      </div>}
      {!positions.length && <p className="mt-1 text-sm muted">보유 중인 종목이 없어요. 매수를 기록하면 여기에 나와요.</p>}
      {val.map(({ x, lp }) => {
        const L = live[x.ticker], pnl = lp != null ? (lp - x.avg) * x.qty : null, pct = lp != null ? (lp / x.avg - 1) * 100 : null;
        const nearStop = x.stop && lp != null && lp <= x.stop * 1.03, hitTarget = x.target && lp != null && lp >= x.target;
        return <div key={x.ticker} className="border-t border-[var(--line)] py-2.5 first-of-type:border-0">
          <button className="flex w-full items-center gap-2.5 text-left" onClick={() => onOpenTicker(x.ticker, todayEt())}>
            <span className="grid h-10 w-12 shrink-0 place-items-center rounded-xl bg-[#6366f1] text-[0.72rem] font-extrabold text-white">{x.ticker.slice(0, 5)}</span>
            <span className="min-w-0 flex-1"><b>{x.ticker}</b> {L?.haltedNow ? <span className="tag tag-r">⏸ 정지 중</span> : L?.halts ? <span className="tag tag-a">⏸ 오늘 정지 {L.halts}번</span> : null}
              <span className="block truncate text-xs muted">{x.qty.toLocaleString()}주 · 평단 {px(x.avg)} · 지금 {lp != null ? px(lp) : "–"}</span></span>
            <span className="shrink-0 text-right">{pct != null ? <><b className={`num ${pnlCls(pct)}`}>{signed(pct)}</b><span className={`block text-xs ${pnlCls(pnl!)}`}>{usd(pnl!, true)}</span></> : <span className="text-xs muted">가격 없음</span>}</span>
          </button>
          {(x.stop || x.target) && <div className="mt-1 flex gap-1.5 pl-[3.6rem] text-xs">
            {x.stop && <span className={`tag ${nearStop ? "tag-r" : "tag-n"}`}>손절 {px(x.stop)}{nearStop ? " ⚠ 가까움" : ""}</span>}
            {x.target && <span className={`tag ${hitTarget ? "tag-g" : "tag-n"}`}>목표 {px(x.target)}{hitTarget ? " 🎯 도달" : ""}</span>}</div>}
          <div className="mt-1.5 flex gap-1.5 pl-[3.6rem]">
            <button className="rounded-full bg-[var(--up2)] px-3 py-1 text-xs font-bold text-[var(--up)]" onClick={() => onNew({ side: "buy", ticker: x.ticker, price: lp ?? undefined })}>＋ 더 사기</button>
            <button className="rounded-full bg-[#e8effd] px-3 py-1 text-xs font-bold text-[var(--dn)]" onClick={() => onNew({ side: "sell", ticker: x.ticker, price: lp ?? undefined, qty: x.qty })}>－ 팔기</button>
          </div>
        </div>;
      })}
    </section>
    <section className="card">
      <b>⭐ 관심 종목 {watch.length}개</b>
      {!watch.length && <p className="mt-1 text-sm muted">종목 화면에서 ⭐ 관심 추가를 누르면 여기에 모여요.</p>}
      {watch.map(w => { const L = live[w.ticker], lp = L?.price, ch = lp != null && L?.prev ? (lp / L.prev - 1) * 100 : null;
        return <div key={w.ticker} className="flex items-center justify-between gap-2 border-t border-[var(--line)] py-2 first-of-type:border-0">
          <button className="min-w-0 text-left" onClick={() => onOpenTicker(w.ticker, w.date)}><b>{w.ticker}</b> {L?.halts ? <span className="tag tag-a">⏸ {L.halts}</span> : null} <span className="text-xs muted">{w.name}</span>
            <span className="block text-xs muted">{prettyDate(w.date)}에 담음{w.price != null ? ` · 그때 ${px(w.price)}` : ""}{lp != null ? ` · 지금 ${px(lp)}` : ""}{ch != null ? ` (${signed(ch)})` : ""}</span></button>
          <button className="shrink-0 text-sm muted" onClick={() => onRemoveWatch(w.ticker)}>빼기</button></div>; })}
    </section>
  </>;
}

/* ---------- 📊 통계 ---------- */
function StatTab({ closed, fx }: { closed: Closed[]; fx: number }) {
  const [range, setRange] = useState<"m" | "q" | "y" | "all">("y");
  const t = todayEt(), from = range === "m" ? `${t.slice(0, 7)}-01` : range === "q" ? addDays(t, -91) : range === "y" ? `${t.slice(0, 4)}-01-01` : "";
  const list = closed.filter(c => c.trade.date >= from), s = stats(list), sc = stopCheck(list);
  const byS = groupBy(list, c => c.strategy), byM = groupBy(list, c => c.mood);
  const worst = [...byS, ...byM].filter(g => g.n >= 3 && g.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0];
  const best = byS.filter(g => g.n >= 3 && g.pnl > 0).sort((a, b) => b.pnl - a.pnl)[0];
  const Table = ({ title, rows }: { title: string; rows: ReturnType<typeof groupBy> }) => rows.length ? <>
    <b className="mt-3 block text-sm">{title}</b>
    <table className="mt-1 w-full text-center text-sm num [&_td]:border-t [&_td]:border-[var(--line)] [&_td]:py-1.5 [&_td:first-child]:text-left">
      <thead><tr className="text-xs muted"><th className="text-left font-bold" /><th className="font-bold">횟수</th><th className="font-bold">승률</th><th className="font-bold">평균</th><th className="font-bold">손익</th></tr></thead>
      <tbody>{rows.map(g => <tr key={g.k}><td>{g.k}</td><td>{g.n}</td><td>{Math.round(g.winRate * 100)}%</td><td className={pnlCls(g.avgWin * g.winRate + g.avgLoss * (1 - g.winRate))}>{signed(g.avgWin * g.winRate + g.avgLoss * (1 - g.winRate))}</td><td className={pnlCls(g.pnl)}>{usd(g.pnl, true)}</td></tr>)}</tbody>
    </table></> : null;
  return <>
    <section className="card">
      <div className="flex gap-1 rounded-full bg-[#f1f2f4] p-0.5 text-sm">{([["m", "이번 달"], ["q", "3개월"], ["y", "올해"], ["all", "전체"]] as const).map(([k, l]) =>
        <button key={k} onClick={() => setRange(k)} className={`flex-1 rounded-full py-1 font-bold ${range === k ? "bg-white shadow" : "muted"}`}>{l}</button>)}</div>
      <div className={`mt-2 text-center text-[1.7rem] font-extrabold num ${pnlCls(s.pnl)}`}>{usd(s.pnl, true)}<span className="text-base">{krwToo(s.pnl, fx, true)}</span></div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        {[["승률", s.n ? `${Math.round(s.winRate * 100)}%` : "–", ""], ["평균 이익", s.avgWin ? signed(s.avgWin) : "–", "up"], ["평균 손실", s.avgLoss ? signed(s.avgLoss) : "–", "dn"]].map(([k, v, c]) =>
          <div key={k} className="rounded-xl bg-[#f4f5f7] py-1"><div className="text-[0.7rem] muted">{k}</div><b className={`num ${c}`}>{v}</b></div>)}
      </div>
      {!s.n && <p className="mt-2 text-sm muted">이 기간에 매도한 기록이 없어요. 판 매매만 통계에 들어가요.</p>}
      <Table title="전략별" rows={byS} />
      <Table title="마음 상태별" rows={byM} />
    </section>
    {s.n > 0 && <div className="card !bg-[var(--amber2)] text-sm leading-relaxed text-[#7a5413]">💡 {[
      best ? `가장 잘 된 전략은 ${best.k} (${best.n}번, ${usd(best.pnl, true)})이에요.` : "",
      worst ? `${worst.k}에서 손실이 가장 커요 (${worst.n}번, ${usd(worst.pnl, true)}).` : "",
      sc.kept + sc.broke ? `손절가를 넣은 손실 매매 ${sc.kept + sc.broke}번 중 ${sc.kept}번 지켰어요.${sc.keptAvg != null ? ` 지킨 손실은 평균 ${signed(sc.keptAvg)}` : ""}${sc.brokeAvg != null ? `${sc.keptAvg != null ? "," : ""} 안 지킨 손실은 평균 ${signed(sc.brokeAvg)}` : ""}${sc.keptAvg != null || sc.brokeAvg != null ? "이에요." : ""}` : "손절가를 넣어 두면 지킨 매매와 안 지킨 매매를 비교해 드려요.",
    ].filter(Boolean).join(" ")}</div>}
  </>;
}

/* ---------- 📝 복기: 주간 ---------- */
function RevTab({ reviews, setReviews, closed, trades, fx, say }: Props & { closed: Closed[] }) {
  const [week, setWeek] = useState(weekStart(todayEt()));
  const r = reviews[week] ?? { week, good: "", bad: "", rule: "" };
  const end = addDays(week, 6), wc = closed.filter(c => c.trade.date >= week && c.trade.date <= end), s = stats(wc);
  const wt = trades.filter(t => t.date >= week && t.date <= end);
  const lastRule = Object.values(reviews).filter(x => x.week < week && x.rule).sort((a, b) => b.week.localeCompare(a.week))[0];
  const set = (k: keyof Review, v: string) => setReviews(p => ({ ...p, [week]: { ...r, [k]: v } }));
  const text = [`📒 매매 복기 ${prettyDate(week)} ~ ${prettyDate(end)}`, `매매 ${wt.length}건 · 매도 ${s.n}건 · 승률 ${s.n ? Math.round(s.winRate * 100) : 0}% · 실현 ${usd(s.pnl, true)}${krwToo(s.pnl, fx, true)}`,
    ...wc.map(c => `· ${c.trade.ticker} ${usd(c.pnl, true)} (${signed(c.pct)})${c.strategy ? ` ${c.strategy}` : ""}${c.mood ? ` ${c.mood}` : ""}`),
    r.good && `👍 잘한 점: ${r.good}`, r.bad && `🤔 아쉬운 점: ${r.bad}`, r.rule && `📌 다음 주 규칙: ${r.rule}`].filter(Boolean).join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(text); say("복사했어요. 카톡에 붙여 넣으세요"); } catch { say("복사하지 못했어요"); } };
  const F = (k: "good" | "bad" | "rule", label: string, ph: string) => <label className="block"><span className="mb-1 block text-sm font-bold">{label}</span>
    <textarea className="inp min-h-[3.5rem]" value={r[k]} placeholder={ph} onChange={e => set(k, e.target.value)} /></label>;
  return <>
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setWeek(addDays(week, -7))} className="h-8 w-8 rounded-lg bg-[#f1f2f4] font-bold" aria-label="이전 주">‹</button>
        <b className="text-sm">{prettyDate(week)} ~ {prettyDate(end)}</b>
        <button onClick={() => setWeek(addDays(week, 7))} className="h-8 w-8 rounded-lg bg-[#f1f2f4] font-bold" aria-label="다음 주">›</button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[["매매", `${wt.length}건`, ""], ["승률", s.n ? `${Math.round(s.winRate * 100)}%` : "–", ""], ["실현", usd(s.pnl, true), pnlCls(s.pnl)]].map(([k, v, c]) =>
          <div key={k} className="rounded-xl bg-[#f4f5f7] py-1"><div className="text-[0.7rem] muted">{k}</div><b className={`num ${c}`}>{v}</b></div>)}
      </div>
      {lastRule && <p className="rounded-xl bg-[var(--acc2)] px-3 py-2 text-sm">📌 지난주에 정한 규칙: <b>{lastRule.rule}</b></p>}
      {F("good", "👍 잘한 점", "예: 돌파 매매는 계획대로 나눠서 팔았다")}
      {F("bad", "🤔 아쉬운 점", "예: 정지 풀린 직후 조급하게 추격했다")}
      {F("rule", "📌 다음 주 규칙", "예: 하루 3번 넘게 매매하지 않기")}
      <button className="btn btn-out w-full" onClick={copy}>📋 카톡용으로 복사</button>
    </section>
  </>;
}

/* ---------- ⚙ 일지 설정 · 백업 ---------- */
function Settings({ settings, setSettings, liveFx, backup, restore, say, onClose }: Props & { onClose: () => void }) {
  const [fee, setFee] = useState(String(settings.feeRate)), [fx, setFx] = useState(settings.fx ? String(settings.fx) : "");
  const file = useRef<HTMLInputElement>(null);
  const makeFile = () => new File([JSON.stringify(backup())], `매매일지-백업-${todayEt().replaceAll("-", "")}.json`, { type: "application/json" });
  const saveFile = () => {
    const f = makeFile(), url = URL.createObjectURL(f), a = document.createElement("a");
    a.href = url; a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  // 휴대폰 공유 창을 열어 카톡(나와의 채팅 등)·메일·드라이브로 보낸다. 공유를 못 하는 브라우저는 파일로 저장
  const shareFile = async () => {
    const f = makeFile();
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: "매매일지 백업" }); say("보냈어요. 카톡에서 파일을 받아 두세요"); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    saveFile(); say("이 브라우저는 바로 보내기가 안 돼서 파일로 저장했어요. 저장된 파일을 카톡으로 보내 주세요");
  };
  return (
    <section className="card space-y-3 text-sm">
      <div className="flex justify-between"><b>⚙ 일지 설정</b><button className="muted" onClick={onClose}>닫기</button></div>
      <label className="block"><span className="mb-1 block font-bold">수수료 (매매 금액의 %)</span><input className="inp" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} /></label>
      <div><span className="mb-1 block font-bold">환율 (원/$)</span>
        <div className="grid grid-cols-2 gap-1.5">
          <button className={`rounded-xl py-2 font-bold ${settings.fxAuto ? "bg-[var(--acc)] text-white" : "bg-[#f1f2f4] muted"}`} onClick={() => setSettings({ ...settings, fxAuto: true })}>자동{liveFx ? ` (${liveFx.toLocaleString()})` : ""}</button>
          <button className={`rounded-xl py-2 font-bold ${!settings.fxAuto ? "bg-[var(--acc)] text-white" : "bg-[#f1f2f4] muted"}`} onClick={() => setSettings({ ...settings, fxAuto: false })}>직접 넣기</button>
        </div>
        {!settings.fxAuto && <input className="inp mt-1.5" inputMode="decimal" value={fx} onChange={e => setFx(e.target.value)} placeholder="예: 1390" />}
        <span className="mt-1 block text-xs muted">원화는 참고용이에요. 매매할 때의 환율은 기록마다 따로 저장돼요.</span></div>
      <button className="btn btn-fill w-full" onClick={() => { setSettings({ ...settings, feeRate: parseFloat(fee) || 0, fx: parseFloat(fx) || 0 }); say("설정을 저장했어요"); }}>저장</button>
      <button className="btn w-full !bg-[#fee500] !text-[#3c1e1e]" onClick={shareFile}>💬 카톡으로 백업 보내기</button>
      <div className="grid grid-cols-2 gap-1.5">
        <button className="btn btn-gray" onClick={saveFile}>💾 휴대폰에 저장</button>
        <button className="btn btn-gray" onClick={() => file.current?.click()}>📂 불러오기</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => {
        const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
        f.text().then(t => { const j = JSON.parse(t); if (!Array.isArray(j?.trades)) throw 0; if (confirm(`매매 ${j.trades.length}건이 든 백업이에요. 지금 기록을 바꿀까요?`)) { restore(j); say("불러왔어요"); } }).catch(() => say("매매일지 백업 파일이 아니에요"));
      }} />
      <p className="text-xs leading-relaxed muted">기록은 이 휴대폰에만 저장돼요. <b>💬 카톡으로 백업 보내기</b>를 누르고 공유 창에서 카카오톡 → <b>나와의 채팅</b>을 고르면 편해요.
        되살릴 때는 카톡에서 그 파일을 눌러 <b>저장</b>한 뒤 <b>📂 불러오기</b>로 고르세요.</p>
    </section>
  );
}
