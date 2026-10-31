"use client";
// 미국 급등주·거래정지: 📅 급등(달력 → 그날 거래정지·급등) · 💬 질문 · ⭐ 관심 · 📊 검증
import { useCallback, useEffect, useState } from "react";
import { useStored } from "@/lib/store";
import { lastTradingDay, marketOpen, todayEt } from "@/lib/time";
import type { Day, Row } from "@/lib/types";
import Calendar from "./Calendar";
import DayList from "./DayList";
import StockDetail from "./StockDetail";
import Chat from "./Chat";
import Watch from "./Watch";
import Verify, { type Seen } from "./Verify";

export type WatchItem = { ticker: string; name: string; date: string; price: number | null; rate: number | null };

export default function App() {
  const [tab, setTab] = useState<"surge" | "chat" | "watch" | "verify">("surge");
  const [date, setDate] = useState(lastTradingDay);
  const [month, setMonth] = useState(() => lastTradingDay().slice(0, 7));
  const [haltCounts, setHaltCounts] = useState<Record<string, number>>({});
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<{ date: string; row: Row } | null>(null);
  const [watch, setWatch] = useStored<WatchItem[]>("us.watch", []);
  const [seen, setSeen] = useStored<Seen>("us.seen", {});
  const [preset, setPreset] = useState("");
  const [toast, setToast] = useState("");
  const say = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(""), 2500); }, []);
  const clearPreset = useCallback(() => setPreset(""), []);

  useEffect(() => {
    fetch(`/api/month?m=${month}`).then(r => r.json()).then(j => setHaltCounts(j.halts ?? {})).catch(() => {});
  }, [month]);

  const loadDay = useCallback((quiet = false) => {
    if (!quiet) { setLoading(true); setErr(""); setDay(null); }
    fetch(`/api/day?d=${date}`).then(async r => {
      const j: Day = await r.json();
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
    const onPop = () => setOpen(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const openRow = (d: string, row: Row) => { history.pushState({ t: row.ticker }, ""); setOpen({ date: d, row }); scrollTo(0, 0); };
  const toggleWatch = (d: string, r: Row) => {
    const has = watch.some(w => w.ticker === r.ticker);
    setWatch(p => has ? p.filter(w => w.ticker !== r.ticker) : [{ ticker: r.ticker, name: r.name, date: d, price: r.price, rate: r.rate }, ...p]);
    say(has ? "관심종목에서 뺐어요" : "관심종목에 넣었어요");
  };

  if (open) return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <StockDetail date={open.date} row={open.row} onBack={() => history.back()}
        watched={watch.some(w => w.ticker === open.row.ticker)} onWatch={() => toggleWatch(open.date, open.row)}
        onAsk={() => { setPreset(`${open.row.ticker} ${open.date.slice(5).replace("-", "/")}에 왜 올랐어(멈췄어)? 위험한 점도 알려 줘`); history.back(); setTab("chat"); setDate(open.date); }} />
      {toast && <Toast text={toast} />}
    </main>
  );

  const gainCounts = Object.fromEntries(Object.entries(seen).map(([d, s]) => [d, s.gainers]));
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-[max(env(safe-area-inset-top),1rem)]">
      <h1 className="mb-3 mt-1 text-2xl font-extrabold">🇺🇸 급등주·거래정지</h1>
      <div className="card mb-3 grid grid-cols-4 gap-1 !rounded-full !p-1">
        {([["surge", "📅 급등"], ["chat", "💬 질문"], ["watch", "⭐ 관심"], ["verify", "📊 검증"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full py-2 text-[0.85rem] font-bold ${tab === k ? "bg-[var(--acc)] text-white" : "muted"}`}>{l}</button>
        ))}
      </div>

      {tab === "surge" && <>
        <Search date={date} onOpen={r => openRow(date, r)} />
        <Calendar month={month} setMonth={setMonth} date={date} setDate={setDate} halts={haltCounts} gainers={gainCounts} />
        <DayList date={date} day={day} loading={loading} err={err} onOpen={r => openRow(date, r)} />
      </>}
      {tab === "chat" && <Chat date={date} day={day} goSurge={() => setTab("surge")} preset={preset} clearPreset={clearPreset} />}
      {tab === "watch" && <Watch items={watch} onOpen={w => openRow(w.date, { ticker: w.ticker, name: w.name, market: "", price: w.price, rate: w.rate, dollarVol: null, volRatio: null, halts: [], haltedNow: false })}
        onRemove={t => setWatch(p => p.filter(w => w.ticker !== t))} />}
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
