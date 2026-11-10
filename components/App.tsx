"use client";
// 미국 급등주·매매일지: 📅 급등(달력 → 그날 거래정지·급등) · 💬 질문 · 📒 일지(달력·보유·통계·복기) · 📊 검증
import { useCallback, useEffect, useRef, useState } from "react";
import { useStored } from "@/lib/store";
import { lastTradingDay, marketOpen, todayEt } from "@/lib/time";
import type { Day, Row } from "@/lib/types";
import Calendar from "./Calendar";
import DayList from "./DayList";
import StockDetail from "./StockDetail";
import Chat from "./Chat";
import Journal from "./Journal";
import TradeForm, { type TradeInit } from "./TradeForm";
import { compute, DEFAULT_SETTINGS, type JSettings, type Review, type Trade } from "@/lib/journal";
import Verify, { type Seen } from "./Verify";

export type WatchItem = { ticker: string; name: string; date: string; price: number | null; rate: number | null };

export default function App() {
  const [tab, setTab] = useState<"surge" | "chat" | "journal" | "verify">("surge");
  const [date, setDate] = useState(lastTradingDay);
  const [month, setMonth] = useState(() => lastTradingDay().slice(0, 7));
  const [haltCounts, setHaltCounts] = useState<Record<string, number>>({});
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<{ date: string; row: Row } | null>(null);
  const [watch, setWatch] = useStored<WatchItem[]>("us.watch", []);
  const [seen, setSeen] = useStored<Seen>("us.seen", {});
  const [trades, setTrades] = useStored<Trade[]>("us.trades", []);
  const [reviews, setReviews] = useStored<Record<string, Review>>("us.reviews", {});
  const [jset, setJset] = useStored<JSettings>("us.jset", DEFAULT_SETTINGS);
  const [liveFx, setLiveFx] = useState<number | null>(null);
  const [form, setForm] = useState<TradeInit | null>(null);
  const formRef = useRef<TradeInit | null>(null);
  formRef.current = form;
  const [preset, setPreset] = useState("");
  const [toast, setToast] = useState("");
  const say = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(""), 2500); }, []);
  const clearPreset = useCallback(() => setPreset(""), []);

  useEffect(() => { fetch("/api/fx").then(r => r.ok ? r.json() : null).then(j => j?.fx && setLiveFx(j.fx)).catch(() => {}); }, []);
  const settings = { ...DEFAULT_SETTINGS, ...jset };
  const fx = settings.fxAuto ? liveFx ?? settings.fx : settings.fx;
  const held = (t: string) => compute(trades).positions.find(x => x.ticker === t)?.qty ?? 0;

  useEffect(() => {
    fetch(`/api/month?m=${month}`).then(r => r.json()).then(j => setHaltCounts(j.halts ?? {})).catch(() => {});
  }, [month]);

  const loadDay = useCallback((quiet = false) => {
    if (!quiet) { setLoading(true); setErr(""); setDay(null); }
    fetch(`/api/day?d=${date}`).then(async r => {
      const txt = await r.text();
      let j: Day;
      try { j = JSON.parse(txt); } catch { throw new Error(r.status === 504 ? "서버 응답이 너무 늦어요 (시간 초과). 잠시 뒤 다시 눌러 주세요." : `서버 오류예요 (${r.status}). 잠시 뒤 다시 해 주세요.`); }
      if (!r.ok) throw new Error((j as unknown as { error: string }).error);
      setDay(j);
      // 📊 검증용: 지난 날짜의 결과를 이 휴대폰에 모아 둔다
      if (date < todayEt()) setSeen(p => ({ ...p, [date]: { gainers: j.gainers.length, rows: [...new Map([...j.halts, ...j.gainers].map(x => [x.ticker, x])).values()].filter(x => x.after?.next != null).map(x => ({
        t: x.ticker, rate: x.rate, luld: x.halts.filter(h => h.kind === "luld").length, other: x.halts.filter(h => h.kind !== "luld").length, next: x.after!.next!, now: x.after!.now,
      })) } }));
    }).catch(e => setErr(e.message || "자료를 불러오지 못했어요.")).finally(() => setLoading(false));
  }, [date, setSeen]);
  useEffect(() => { loadDay(); }, [loadDay]);
  useEffect(() => {
    if (date !== todayEt()) return;
    const t = setInterval(() => { if (marketOpen() && document.visibilityState === "visible") loadDay(true); }, 30_000);
    return () => clearInterval(t);
  }, [date, loadDay]);

  useEffect(() => {
    // 뒤로가기: 기록 화면이 열려 있으면 그것만 닫고, 아니면 종목 화면을 닫는다
    const onPop = () => { if (formRef.current) setForm(null); else setOpen(null); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const openForm = (init: TradeInit) => { history.pushState({ form: 1 }, ""); setForm(init); scrollTo(0, 0); };
  const saveTrade = (t: Trade) => { setTrades(p => [...p.filter(x => x.id !== t.id), t]); history.back(); say(`${t.ticker} ${t.side === "buy" ? "매수" : "매도"}를 기록했어요`); };
  const openTicker = (t: string, d: string) => openRow(d, { ticker: t, name: "", market: "", price: null, rate: null, dollarVol: null, volRatio: null, halts: [], haltedNow: false });
  const openRow = (d: string, row: Row) => { history.pushState({ t: row.ticker }, ""); setOpen({ date: d, row }); scrollTo(0, 0); };
  const toggleWatch = (d: string, r: Row) => {
    const has = watch.some(w => w.ticker === r.ticker);
    setWatch(p => has ? p.filter(w => w.ticker !== r.ticker) : [{ ticker: r.ticker, name: r.name, date: d, price: r.price, rate: r.rate }, ...p]);
    say(has ? "관심종목에서 뺐어요" : "관심종목에 넣었어요");
  };

  if (form) return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <TradeForm init={form} settings={settings} fx={fx} held={held} onSave={saveTrade} onBack={() => history.back()}
        onDelete={id => { setTrades(p => p.filter(x => x.id !== id)); history.back(); say("지웠어요"); }}
        onAddStrategy={s => setJset({ ...settings, strategies: [...settings.strategies, s] })} />
      {toast && <Toast text={toast} />}
    </main>
  );

  if (open) return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <StockDetail date={open.date} row={open.row} onBack={() => history.back()}
        watched={watch.some(w => w.ticker === open.row.ticker)} onWatch={() => toggleWatch(open.date, open.row)}
        trades={trades.filter(t => t.ticker === open.row.ticker)} fx={fx}
        onTrade={side => openForm({ side, ticker: open.row.ticker, date: open.date, price: open.row.price ?? undefined, qty: side === "sell" ? held(open.row.ticker) || undefined : undefined })}
        onEditTrade={t => openForm(t)}
        onAsk={() => { setPreset(`${open.row.ticker} ${open.date.slice(5).replace("-", "/")}에 왜 올랐어(멈췄어)? 위험한 점도 알려 줘`); history.back(); setTab("chat"); setDate(open.date); }} />
      {toast && <Toast text={toast} />}
    </main>
  );

  const gainCounts = Object.fromEntries(Object.entries(seen).map(([d, s]) => [d, s.gainers]));
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-[max(env(safe-area-inset-top),1rem)]">
      <h1 className="mb-3 mt-1 text-2xl font-extrabold">🇺🇸 급등주·매매일지</h1>
      <div className="card mb-3 grid grid-cols-4 gap-1 !rounded-full !p-1">
        {([["surge", "📅 급등"], ["chat", "💬 질문"], ["journal", "📒 일지"], ["verify", "📊 검증"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full py-2 text-[0.85rem] font-bold ${tab === k ? "bg-[var(--acc)] text-white" : "muted"}`}>{l}</button>
        ))}
      </div>

      {tab === "surge" && <>
        <Search date={date} onOpen={r => openRow(date, r)} />
        <Calendar month={month} setMonth={setMonth} date={date} setDate={setDate} halts={haltCounts} gainers={gainCounts} />
        <DayList date={date} day={day} loading={loading} err={err} onOpen={r => openRow(date, r)} />
      </>}
      {tab === "chat" && <Chat date={date} day={day} journal={journalText(trades)} goSurge={() => setTab("surge")} preset={preset} clearPreset={clearPreset} />}
      {tab === "journal" && <Journal trades={trades} reviews={reviews} setReviews={setReviews} settings={settings} setSettings={setJset} fx={fx} liveFx={liveFx}
        watch={watch} onRemoveWatch={t => setWatch(p => p.filter(w => w.ticker !== t))} onOpenTicker={openTicker}
        onNew={init => openForm({ side: "buy", ...init })} onEdit={t => openForm(t)} say={say}
        backup={() => ({ app: "us-surge-journal", savedAt: new Date().toISOString(), trades, reviews, settings, watch })}
        restore={j => { const b = j as { trades: Trade[]; reviews?: Record<string, Review>; settings?: JSettings; watch?: typeof watch }; setTrades(b.trades); if (b.reviews) setReviews(b.reviews); if (b.settings) setJset(b.settings); if (b.watch) setWatch(b.watch); }} />}
      {tab === "verify" && <Verify seen={seen} />}

      <footer className="mt-8 border-t border-[var(--line)] pt-4 text-xs leading-relaxed muted">
        이 앱의 정보는 공개 자료를 정리한 참고 자료이며 투자 권유가 아닙니다. 거래정지가 반복된 급등주는 다음 날 크게 떨어지는 경우가 많습니다. 시각은 미국 동부시간(ET)이며 한국 시간을 함께 적었습니다.
      </footer>
      {toast && <Toast text={toast} />}
    </main>
  );
}

/** 티커 검색: 고른 날짜의 그 종목 값·정지 기록을 바로 가져와 분석 화면으로 */
function Search({ date, onOpen }: { date: string; onOpen: (r: Row) => void }) {
  const [q, setQ] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const go = async () => {
    const t = q.trim().toUpperCase();
    if (!t) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/quote?t=${encodeURIComponent(t)}&d=${date}`), j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setQ(""); onOpen(j);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mb-3">
      <div className="flex gap-2">
        <input className="inp !rounded-2xl !bg-white !py-3 uppercase shadow-sm" placeholder="🔍 티커 검색 (예: KNRX)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
        {q.trim() && <button className="btn btn-fill shrink-0 !py-2" disabled={busy} onClick={go}>{busy ? "…" : "보기"}</button>}
      </div>
      {err && <p className="mt-1 text-sm text-[var(--red)]">{err}</p>}
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-[#1f2329] px-4 py-2 text-sm font-bold text-white shadow-lg">{text}</div>;
}

/** 💬 질문에 함께 보내는 내 매매 요약 (최근 40건 + 보유) */
function journalText(trades: Trade[]) {
  if (!trades.length) return "";
  const { closed, positions } = compute(trades);
  const pnl = new Map(closed.map(c => [c.trade.id, c]));
  const recent = [...trades].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at).slice(0, 40);
  return [`[내 매매일지 · 달러 기준]`,
    ...recent.map(t => { const c = pnl.get(t.id); return `${t.date} ${t.time ?? ""} ${t.ticker} ${t.side === "buy" ? "매수" : "매도"} ${t.qty}주 @${t.price}${c ? ` 손익 ${c.pnl.toFixed(0)}$ (${c.pct.toFixed(1)}%)` : ""}${t.strategy ? ` 전략:${t.strategy}` : ""}${t.mood ? ` 마음:${t.mood}` : ""}${t.stop ? ` 손절가:${t.stop}` : ""}${t.memo ? ` 메모:${t.memo.slice(0, 60)}` : ""}`; }),
    `[보유] ${positions.map(x => `${x.ticker} ${x.qty}주 평단 ${x.avg.toFixed(2)}`).join(", ") || "없음"}`].join("\n");
}
