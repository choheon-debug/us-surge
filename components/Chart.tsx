"use client";
// 📈 차트: 1분 / 5분 / 일봉 캔들. 거래정지 구간은 주황 띠. 빨강 오름 · 파랑 내림
import { useEffect, useState } from "react";
import { etDate, etHm } from "@/lib/time";
import type { Bar } from "@/lib/types";

type Data = { bars: Bar[]; prevClose: number | null; halts: { halt: string; resume: string | null; code: string }[] };

export default function Chart({ ticker, date }: { ticker: string; date: string }) {
  const [i, setI] = useState<"1m" | "5m" | "1d">("5m");
  const [d, setD] = useState<Data | null>(null), [err, setErr] = useState(""), [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<Bar | null>(null);
  useEffect(() => {
    setLoading(true); setErr(""); setPick(null);
    fetch(`/api/chart?t=${ticker}&d=${date}&i=${i}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); })
      .catch(e => { setD(null); setErr(e.message || "차트를 불러오지 못했어요."); }).finally(() => setLoading(false));
  }, [ticker, date, i]);

  const W = 360, H = 220, PL = 40, PR = 6, PT = 8, PB = 46, VH = 26;   // 아래 26px은 거래량
  const bars = d?.bars ?? [];
  let body: React.ReactNode = null;
  if (bars.length) {
    const lo = Math.min(...bars.map(b => b.l)), hi = Math.max(...bars.map(b => b.h)), pad = (hi - lo) * 0.05 || hi * 0.01;
    const y0 = lo - pad, y1 = hi + pad, t0 = bars[0].t, t1 = bars.at(-1)!.t + (i === "1d" ? 86400_000 : i === "5m" ? 300_000 : 60_000);
    const X = (t: number) => PL + ((W - PL - PR) * (t - t0)) / (t1 - t0);
    const Y = (v: number) => PT + ((H - PT - PB) * (y1 - v)) / (y1 - y0);
    const vmax = Math.max(...bars.map(b => b.v)) || 1, bw = Math.max(1, ((W - PL - PR) / bars.length) * 0.7);
    const ticks = Array.from({ length: 4 }, (_, k) => y0 + ((y1 - y0) * k) / 3);
    const fmt = (v: number) => (v < 1 ? v.toFixed(3) : v.toFixed(2));
    const xl = i === "1d" ? [0, Math.floor(bars.length / 2), bars.length - 1] : bars.map((b, k) => [b, k] as const).filter(([b]) => /:(00)$/.test(etHm(b.t)) && +etHm(b.t).slice(0, 2) % 2 === 0).map(([, k]) => k);
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" onPointerMove={e => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
        const t = t0 + ((x - PL) / (W - PL - PR)) * (t1 - t0);
        setPick(bars.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), bars[0]));
      }}>
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
        {xl.map(k => <text key={k} x={X(bars[k].t)} y={H - 4} fontSize="9" textAnchor="middle" fill="#8a9099">{i === "1d" ? bars[k] && etDate(bars[k].t).slice(5).replace("-", "/") : etHm(bars[k].t)}</text>)}
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
      {pick ? <p className="num text-xs">{i === "1d" ? etDate(pick.t) : `ET ${etHm(pick.t)}`} · 시 {pick.o} · 고 {pick.h} · 저 {pick.l} · 종 <b>{pick.c}</b> · 거래량 {pick.v.toLocaleString()}</p>
        : <p className="text-xs muted"><span className="rounded bg-[#fde7d2] px-1 text-[var(--amber)]">⏸</span> 거래정지 구간 · 점선 = 전날 종가 · 프리·애프터 포함 · 손가락으로 대면 값이 보여요</p>}
    </section>
  );
}
