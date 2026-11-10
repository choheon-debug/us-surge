"use client";
// 📈 차트: 1분 / 5분 / 일봉 캔들. 거래정지 구간은 주황 띠. 빨강 오름 · 파랑 내림
// 확대·축소: 두 손가락 벌리기/오므리기, ＋/－ 버튼, PC는 마우스 휠. 확대했을 때 한 손가락으로 밀면 옆으로 이동
import { useEffect, useRef, useState } from "react";
import { etDate, etHm, etToIso } from "@/lib/time";
import type { Bar } from "@/lib/types";

type Data = { bars: Bar[]; prevClose: number | null; halts: { halt: string; resume: string | null; code: string }[] };

export type Mark = { date: string; time?: string; side: "buy" | "sell"; price: number };

export default function Chart({ ticker, date, marks = [] }: { ticker: string; date: string; marks?: Mark[] }) {
  const [i, setI] = useState<"1m" | "5m" | "1d">("5m");
  const [d, setD] = useState<Data | null>(null), [err, setErr] = useState(""), [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<Bar | null>(null);
  const [view, setView] = useState<[number, number] | null>(null);   // 보이는 봉 범위 [시작, 끝) — null이면 전체
  const ptrs = useRef(new Map<number, number>());                       // 화면 위 손가락들의 x (svg 좌표)
  const gesture = useRef<{ kind: "pinch" | "pan" | "tap"; dist?: number; x0?: number; view: [number, number] } | null>(null);
  useEffect(() => {
    setLoading(true); setErr(""); setPick(null); setView(null);
    fetch(`/api/chart?t=${ticker}&d=${date}&i=${i}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); })
      .catch(e => { setD(null); setErr(e.message || "차트를 불러오지 못했어요."); }).finally(() => setLoading(false));
  }, [ticker, date, i]);

  const W = 360, H = 220, PL = 40, PR = 6, PT = 8, PB = 46, VH = 26;   // 아래 26px은 거래량
  const full = d?.bars ?? [], N = full.length;
  const [va, vb] = view ?? [0, N];
  const bars = full.slice(va, vb);
  const clampView = (a: number, len: number): [number, number] => { len = Math.max(Math.min(N, 8), Math.min(N, Math.round(len))); a = Math.max(0, Math.min(N - len, Math.round(a))); return [a, a + len]; };
  /** 가운데 c(보이는 범위 안의 비율 0~1)를 기준으로 k배 확대 (k<1이면 축소) */
  const zoom = (k: number, c = 0.5) => { const len = vb - va, nl = len / k; const v = clampView(va + len * c - nl * c, nl); setView(v[0] === 0 && v[1] === N ? null : v); setPick(null); };
  const pan = (frac: number) => { const len = vb - va; setView(clampView(va + len * frac, len)); };
  const regular = () => {   // 정규장 09:30~16:00 ET만
    const a = full.findIndex(b => etHm(b.t) >= "09:30"), z = full.findIndex(b => etHm(b.t) >= "16:00");
    if (a >= 0) setView(clampView(a, (z > a ? z : N) - a));
  };
  let body: React.ReactNode = null;
  if (bars.length) {
    const lo = Math.min(...bars.map(b => b.l)), hi = Math.max(...bars.map(b => b.h)), pad = (hi - lo) * 0.05 || hi * 0.01;
    const y0 = lo - pad, y1 = hi + pad, t0 = bars[0].t, t1 = bars.at(-1)!.t + (i === "1d" ? 86400_000 : i === "5m" ? 300_000 : 60_000);
    const X = (t: number) => PL + ((W - PL - PR) * (t - t0)) / (t1 - t0);
    const Y = (v: number) => PT + ((H - PT - PB) * (y1 - v)) / (y1 - y0);
    const vmax = Math.max(...bars.map(b => b.v)) || 1, bw = Math.max(1, ((W - PL - PR) / bars.length) * 0.7);
    const ticks = Array.from({ length: 4 }, (_, k) => y0 + ((y1 - y0) * k) / 3);
    const fmt = (v: number) => (v < 1 ? v.toFixed(3) : v.toFixed(2));
    const step = Math.max(1, Math.ceil(bars.length / 4)), xl = Array.from({ length: Math.ceil(bars.length / step) }, (_, k) => k * step).filter(k => k < bars.length - step / 3);
    const toSvgX = (e: React.PointerEvent | React.WheelEvent) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * W; };
    const frac = (x: number) => Math.max(0, Math.min(1, (x - PL) / (W - PL - PR)));
    const pickAt = (x: number) => { const t = t0 + frac(x) * (t1 - t0); setPick(bars.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), bars[0])); };
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ touchAction: "pan-y" }}
        onWheel={e => { if (!e.ctrlKey && Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; zoom(e.deltaY < 0 ? 1.25 : 0.8, frac(toSvgX(e))); }}
        onPointerDown={e => {
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          ptrs.current.set(e.pointerId, toSvgX(e));
          const xs = [...ptrs.current.values()];
          gesture.current = xs.length >= 2 ? { kind: "pinch", dist: Math.abs(xs[0] - xs[1]) || 1, view: [va, vb] } : { kind: "tap", x0: xs[0], view: [va, vb] };
          if (xs.length === 1) pickAt(xs[0]);
        }}
        onPointerMove={e => {
          const x = toSvgX(e);
          if (!ptrs.current.has(e.pointerId)) { if (e.pointerType === "mouse") pickAt(x); return; }
          ptrs.current.set(e.pointerId, x);
          const g = gesture.current, xs = [...ptrs.current.values()];
          if (!g) return;
          if (g.kind === "pinch" && xs.length >= 2) {
            const len = (g.view[1] - g.view[0]) * (g.dist! / (Math.abs(xs[0] - xs[1]) || 1)), c = frac((xs[0] + xs[1]) / 2);
            const v = clampView(g.view[0] + (g.view[1] - g.view[0]) * c - len * c, len); setView(v[0] === 0 && v[1] === N ? null : v); setPick(null);
          } else if (xs.length === 1) {
            const zoomed = g.view[1] - g.view[0] < N;
            if (zoomed && (g.kind === "pan" || Math.abs(x - g.x0!) > 8)) {   // 확대한 상태에서 밀면 옆으로 이동
              g.kind = "pan"; const len = g.view[1] - g.view[0]; setView(clampView(g.view[0] - ((x - g.x0!) / (W - PL - PR)) * len, len)); setPick(null);
            } else pickAt(x);
          }
        }}
        onPointerUp={e => { ptrs.current.delete(e.pointerId); if (!ptrs.current.size) gesture.current = null; else gesture.current = { kind: "tap", x0: [...ptrs.current.values()][0], view: [va, vb] }; }}
        onPointerCancel={e => { ptrs.current.delete(e.pointerId); gesture.current = null; }}>
        {i !== "1d" && d!.halts.map((h, k) => {
          const a = new Date(h.halt).getTime(), z = h.resume ? new Date(h.resume).getTime() : t1;
          if (z < t0 || a > t1) return null;
          return <g key={k}><rect x={X(Math.max(a, t0))} y={PT} width={Math.max(2, X(Math.min(z, t1)) - X(Math.max(a, t0)))} height={H - PT - PB} fill="#fde7d2" />
            <text x={X(Math.max(a, t0)) + 1} y={PT + 9} fontSize="8" fill="#b45309">⏸</text></g>;
        })}
        {i === "1d" && (() => { const k = bars.findIndex(b => etDate(b.t) === date); return k < 0 ? null : <rect x={X(bars[k].t) - bw} y={PT} width={bw * 3} height={H - PT - PB} fill="#e7f6ee" />; })()}
        {ticks.map(v => <g key={v}><line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke="#eceef1" /><text x={PL - 3} y={Y(v) + 3} fontSize="9" textAnchor="end" fill="#8a9099">{fmt(v)}</text></g>)}
        {d!.prevClose && i !== "1d" && d!.prevClose > y0 && d!.prevClose < y1 && <line x1={PL} x2={W - PR} y1={Y(d!.prevClose)} y2={Y(d!.prevClose)} stroke="#9aa0a8" strokeDasharray="3 3" />}
        {bars.map(b => {
          const c = b.c >= b.o ? "#e0352b" : "#2563eb", x = X(b.t) + bw / 2;
          return <g key={b.t}>
            <line x1={x} x2={x} y1={Y(b.h)} y2={Y(b.l)} stroke={c} strokeWidth="0.7" />
            <rect x={x - bw / 2} y={Math.min(Y(b.o), Y(b.c))} width={bw} height={Math.max(0.8, Math.abs(Y(b.o) - Y(b.c)))} fill={c} />
            <rect x={x - bw / 2} y={H - PB + 20 + VH - (VH * b.v) / vmax - 20} width={bw} height={(VH * b.v) / vmax} fill={c} opacity="0.35" />
          </g>;
        })}
        {xl.map(k => <text key={k} x={Math.max(PL + 12, X(bars[k].t))} y={H - 4} fontSize="9" textAnchor="middle" fill="#8a9099">{i === "1d" ? bars[k] && etDate(bars[k].t).slice(5).replace("-", "/") : etHm(bars[k].t)}</text>)}
        {marks.map((mk, k) => {
          // 내 매매: 분봉은 시각이 있으면 그 자리, 없으면 왼쪽 끝에 가격 선 · 일봉은 그날 봉 위치
          if (mk.price < y0 || mk.price > y1) return null;
          let x: number | null = null;
          if (i === "1d") { const b = bars.find(z => etDate(z.t) === mk.date); if (b) x = X(b.t) + bw / 2; }
          else if (mk.date === date && mk.time) { const tt = new Date(etToIso(mk.date, mk.time) ?? 0).getTime(); if (tt < t0 || tt > t1) return null; x = X(tt); }
          else if (mk.date !== date) return null;
          const c = mk.side === "buy" ? "#e0352b" : "#2563eb", y = Y(mk.price);
          if (x == null) return <g key={`m${k}`}><line x1={PL} x2={W - PR} y1={y} y2={y} stroke={c} strokeDasharray="2 3" strokeWidth="0.8" /><text x={PL + 2} y={y - 2} fontSize="8" fill={c}>{mk.side === "buy" ? "내 매수" : "내 매도"} {mk.price}</text></g>;
          return <path key={`m${k}`} d={mk.side === "buy" ? `M${x} ${y + 3} l-4 7 h8 z` : `M${x} ${y - 3} l-4 -7 h8 z`} fill={c} stroke="#fff" strokeWidth="0.8" />;
        })}
        {pick && <line x1={X(pick.t) + bw / 2} x2={X(pick.t) + bw / 2} y1={PT} y2={H - PB + 26} stroke="#16181d" strokeWidth="0.5" />}
      </svg>
    );
  }
  return (
    <section className="card mb-3">
      <div className="mb-1 flex items-center justify-between">
        <b>📈 차트</b>
        <div className="flex gap-1 rounded-full bg-[#f1f2f4] p-0.5 text-sm">
          {(["1m", "5m", "1d"] as const).map(x => <button key={x} onClick={() => setI(x)} className={`rounded-full px-3 py-0.5 font-bold ${i === x ? "bg-white shadow" : "muted"}`}>{x === "1m" ? "1분" : x === "5m" ? "5분" : "일봉"}</button>)}
        </div>
      </div>
      {loading && <p className="py-12 text-center text-sm muted">차트 불러오는 중…</p>}
      {!loading && err && <p className="py-8 text-center text-sm muted">{err}</p>}
      {!loading && body}
      {!loading && N > 0 && <div className="mb-1 flex items-center gap-1.5 text-sm">
        <button className="h-8 w-8 shrink-0 rounded-lg bg-[#f1f2f4] font-bold" aria-label="왼쪽으로" disabled={va === 0} onClick={() => pan(-0.5)}>‹</button>
        <button className="h-8 w-8 shrink-0 rounded-lg bg-[#f1f2f4] text-lg font-bold" aria-label="축소" disabled={!view} onClick={() => zoom(0.6)}>－</button>
        <button className="h-8 w-8 shrink-0 rounded-lg bg-[#f1f2f4] text-lg font-bold" aria-label="확대" disabled={vb - va <= 8} onClick={() => zoom(1.6)}>＋</button>
        <button className="h-8 w-8 shrink-0 rounded-lg bg-[#f1f2f4] font-bold" aria-label="오른쪽으로" disabled={vb >= N} onClick={() => pan(0.5)}>›</button>
        {i !== "1d" && <button className="h-8 shrink-0 whitespace-nowrap rounded-lg bg-[#f1f2f4] px-2 text-xs font-bold" onClick={regular}>정규장</button>}
        <button className="ml-auto h-8 shrink-0 whitespace-nowrap rounded-lg bg-[#f1f2f4] px-2 text-xs font-bold disabled:opacity-40" disabled={!view} onClick={() => { setView(null); setPick(null); }}>↺ 전체</button>
      </div>}
      {pick ? <p className="num text-xs">{i === "1d" ? etDate(pick.t) : `ET ${etHm(pick.t)}`} · 시 {fp(pick.o)} · 고 {fp(pick.h)} · 저 {fp(pick.l)} · 종 <b>{fp(pick.c)}</b> · 거래량 {pick.v.toLocaleString()}</p>
        : <p className="text-xs muted"><span className="rounded bg-[#fde7d2] px-1 text-[var(--amber)]">⏸</span> 거래정지 구간 · 점선 = 전날 종가{marks.length ? " · ▲ 내 매수 ▼ 내 매도" : ""} · 프리·애프터 포함 · 손가락으로 대면 값 · 두 손가락으로 확대</p>}
    </section>
  );
}

const fp = (v: number) => (v < 1 ? v.toFixed(4) : v.toFixed(2));
