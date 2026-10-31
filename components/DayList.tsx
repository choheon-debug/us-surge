"use client";
// 그날 목록: ⏸ 거래정지(기본) / ▲ +20% 이상 / 거래대금. 지난 날짜는 "그 뒤" 결과까지
import { useState } from "react";
import { etHm, isTradingDay, kstHm, money, prettyDate, signed, todayEt } from "@/lib/time";
import type { Day, HaltEvent, Row } from "@/lib/types";

type Props = { date: string; day: Day | null; loading: boolean; err: string; onOpen: (r: Row) => void };

export default function DayList({ date, day, loading, err, onOpen }: Props) {
  const [f, setF] = useState<"halt" | "gain" | "value">("halt");
  const list = !day ? [] : f === "halt" ? day.halts : f === "gain" ? day.gainers
    : [...new Map([...day.halts, ...day.gainers].map(r => [r.ticker, r])).values()].sort((a, b) => (b.dollarVol ?? 0) - (a.dollarVol ?? 0)).slice(0, 40);
  const past = date < todayEt();
  const withNext = list.filter(r => r.after?.next != null);
  const avg = withNext.length ? withNext.reduce((a, r) => a + r.after!.next!, 0) / withNext.length : null;

  return (
    <section>
      <div className="mx-1 mb-2 mt-4 flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold">{prettyDate(date)}</h2>
        <span className="text-xs muted">{day ? `정지 ${day.halts.length} · 급등 ${day.gainers.length}` : ""}</span>
      </div>
      {loading && <p className="card text-center muted">불러오는 중… (정지 종목이 많으면 20초쯤)</p>}
      {err && <p className="card text-sm text-[var(--red)]">{err}</p>}
      {day && !isTradingDay(date) && <p className="card text-center muted">{date > todayEt() ? "아직 오지 않은 날이에요." : "미국 증시 휴장일이에요."}</p>}
      {day?.notes.map(n => <p key={n} className="card mb-2 !bg-[var(--amber2)] text-sm text-[var(--amber)]">{n}</p>)}

      {day && isTradingDay(date) && <>
        <div className="mb-2 flex gap-1.5 overflow-x-auto">
          {([["halt", `⏸ 거래정지 ${day.halts.length}`], ["gain", `▲ +20% 이상 ${day.gainers.length}`], ["value", "거래대금"]] as const).map(([k, l]) =>
            <button key={k} onClick={() => setF(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${f === k ? "bg-[var(--acc)] text-white" : "bg-white muted"}`}>{l}</button>)}
        </div>
        <div className="mx-1 mb-2 flex justify-between text-xs muted">
          <span>{day.live ? <><b className="up">● 장중</b> ET {day.asOf}</> : date === todayEt() ? `ET ${day.asOf} 기준` : "장 마감 기준"}</span>
          {day.live && <span>30초마다 새로고침</span>}
        </div>
        {past && avg != null && (
          <div className="card mb-2.5 !bg-[var(--acc2)]">
            <b>📊 이 날 {f === "halt" ? "정지 종목" : "급등주"}, 다음 날엔?</b>
            <div className="mt-1 flex justify-between text-sm"><span className="muted">다음 날 평균</span><b className={avg < 0 ? "dn" : "up"}>{signed(avg)}</b></div>
            <div className="flex justify-between text-sm"><span className="muted">다음 날 오른 종목</span><b>{withNext.length}개 중 {withNext.filter(r => r.after!.next! > 0).length}개</b></div>
          </div>
        )}
        {!list.length && <p className="card text-center muted">{f === "halt" ? "이 날은 거래정지 종목이 없어요." : "이 조건에 맞는 종목이 없어요."}</p>}
        {list.map((r, i) => <RowCard key={r.ticker} n={i + 1} r={r} onOpen={() => onOpen(r)} />)}
      </>}
    </section>
  );
}

/** 정지 기록 요약: 변동성 정지 ×n, 뉴스·규제 정지는 따로 빨갛게 */
export function HaltBox({ halts, haltedNow }: { halts: HaltEvent[]; haltedNow: boolean }) {
  if (!halts.length) return null;
  const luld = halts.filter(h => h.kind === "luld"), other = halts.filter(h => h.kind !== "luld");
  return <>
    {other.map((h, i) => (
      <div key={i} className="mt-2 rounded-xl bg-[var(--red2)] px-3 py-2 text-sm">
        <div className="flex justify-between gap-2"><b className="text-[var(--red)]">⛔ {h.label} ({h.code})</b><span className="shrink-0 text-xs muted">{etHm(h.halt)} ~ {h.resume ? etHm(h.resume) : "재개 미정"}</span></div>
        <div className="text-xs muted">{h.plain}</div>
      </div>))}
    {luld.length > 0 && (
      <div className="mt-2 rounded-xl bg-[var(--amber2)] px-3 py-2 text-sm">
        <div className="flex justify-between gap-2"><b className="text-[var(--amber)]">⏸ 변동성 정지 ×{luld.length}</b>
          <span className="shrink-0 text-xs muted">{haltedNow ? "지금 정지 중" : luld.at(-1)!.resume ? `마지막 재개 ${etHm(luld.at(-1)!.resume!)}` : ""}</span></div>
        <div className="text-xs muted">{luld.slice(0, 8).map(h => etHm(h.halt)).join(" · ")}{luld.length > 8 ? " …" : ""} (ET) · 한국 {kstHm(luld[0].halt)}부터</div>
      </div>)}
  </>;
}

export function RowCard({ n, r, onOpen }: { n: number; r: Row; onOpen: () => void }) {
  const up = (r.rate ?? 0) >= 0;
  return (
    <article className="card mb-2.5 cursor-pointer" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="text-xs font-semibold muted">{n}. {r.market || "미국"}</div>
          <div className="text-[1.15rem] font-extrabold">{r.ticker}</div><div className="truncate text-xs muted">{r.name}</div></div>
        <div className="shrink-0 text-right">
          <div className={`num text-[1.1rem] font-extrabold ${r.haltedNow ? "" : up ? "up" : "dn"}`}>{r.price != null ? `$${r.price < 1 ? r.price.toFixed(4) : r.price.toFixed(2)}` : "–"}</div>
          {r.haltedNow ? <span className="inline-block rounded-lg bg-[#6b7280] px-2 py-0.5 text-sm font-extrabold text-white">정지 중</span>
            : r.rate != null && <span className={`num inline-block rounded-lg px-2 py-0.5 text-sm font-extrabold text-white ${up ? "bg-[var(--up)]" : "bg-[var(--dn)]"}`}>{signed(r.rate)}</span>}
        </div>
      </div>
      <HaltBox halts={r.halts} haltedNow={r.haltedNow} />
      {(r.dollarVol != null || r.volRatio != null) && <div className="mt-2 grid grid-cols-2 gap-1.5 text-center">
        <div className="rounded-xl bg-[#f4f5f7] py-1"><div className="text-[0.68rem] muted">거래대금</div><b className="num text-sm">{r.dollarVol != null ? money(r.dollarVol) : "–"}</b></div>
        <div className="rounded-xl bg-[#f4f5f7] py-1"><div className="text-[0.68rem] muted">거래량 증가</div><b className="num text-sm up">{r.volRatio != null ? `+${r.volRatio.toLocaleString()}%` : "–"}</b></div>
      </div>}
      <div className="mt-2 flex justify-end text-sm font-bold text-[var(--acc)]">차트 · 이유 분석 ›</div>
      {r.after && <div className="mt-1 flex justify-between border-t border-[var(--line)] pt-1.5 text-sm">
        <span className="muted">그 뒤</span>
        <span>다음 날 <b className={(r.after.next ?? 0) < 0 ? "dn" : "up"}>{r.after.next == null ? "–" : signed(r.after.next)}</b>
          {r.after.now != null && <> · 지금 <b className={r.after.now < 0 ? "dn" : "up"}>{signed(r.after.now)}</b></>}</span>
      </div>}
    </article>
  );
}
