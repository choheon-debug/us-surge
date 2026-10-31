"use client";
// 종목 분석: 헤더(자세히) · 📈 차트 · ⏸ 정지 기록 · 🔎 급등·정지 이유(AI) · 뉴스 · ⚠️ 리스크
import { useEffect, useState } from "react";
import { etHm, kstHm, money, prettyDate, signed } from "@/lib/time";
import type { Analysis } from "@/lib/claude";
import type { Row } from "@/lib/types";
import Chart from "./Chart";

type Props = { date: string; row: Row; onBack: () => void; watched: boolean; onWatch: () => void; onAsk: () => void };
const KIND = { "호재 발표": "tag-g", 뉴스: "tag-n", 테마: "tag-a", "이유 불명": "tag-r", 악재: "tag-r" } as const;
const TONE = { 긍정: "tag-g", 부정: "tag-r", 중립: "tag-n" } as const;
const LV = { ok: "text-[var(--acc)]", mid: "text-[var(--amber)]", bad: "up" } as const;

export default function StockDetail({ date, row, onBack, watched, onWatch, onAsk }: Props) {
  const [r, setR] = useState(row);
  const [a, setA] = useState<{ analysis: Analysis; at: string } | null>(null);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [err, setErr] = useState("");
  // 관심종목에서 열면 값이 비어 있으니 그날 값을 다시 가져온다
  useEffect(() => {
    if (row.halts.length || row.dollarVol != null) return;
    fetch(`/api/quote?t=${row.ticker}&d=${date}`).then(x => x.ok ? x.json() : null).then(j => j && setR(j)).catch(() => {});
  }, [row, date]);

  const analyze = async (refresh = false) => {
    setBusy(true); setErr(""); setStatus("요청 보내는 중…");
    const facts = [`이름 ${r.name} · 거래소 ${r.market}`, r.rate != null ? `그날 등락률 ${r.rate}% · 가격 $${r.price}` : "", r.dollarVol ? `거래대금 $${Math.round(r.dollarVol)}` : "",
      r.halts.length ? `거래정지: ${r.halts.map(h => `${h.code}(${h.label}) ${etHm(h.halt)}ET~${h.resume ? etHm(h.resume) : "미정"}`).join(", ")}` : "그날 거래정지 기록 없음"].filter(Boolean).join("\n");
    try {
      const res = await fetch(`/api/analyze${refresh ? "?refresh=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: r.ticker, date, facts }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error || "분석을 시작하지 못했어요");
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
        for (const p of parts) {
          if (!p.startsWith("data: ")) continue;
          const e = JSON.parse(p.slice(6));
          if (e.type === "status") setStatus(e.text);
          else if (e.type === "error") throw new Error(e.message);
          else if (e.type === "result") setA({ analysis: e.analysis, at: e.at });
        }
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { analyze(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const c = a?.analysis.company, up = (r.rate ?? 0) >= 0;
  return (
    <div>
      <button onClick={onBack} className="mb-2 text-sm font-bold muted">‹ {prettyDate(date)}</button>
      <section className="card mb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><div className="text-xs muted">{r.market || "미국"} · {r.ticker}</div><h1 className="text-[1.35rem] font-extrabold leading-snug">{c?.name || r.name || r.ticker}</h1></div>
          <div className="shrink-0 text-right"><div className={`num text-[1.35rem] font-extrabold ${up ? "up" : "dn"}`}>{r.price != null ? `$${r.price < 1 ? r.price.toFixed(4) : r.price.toFixed(2)}` : "–"}</div>
            {r.rate != null && <div className={`num font-bold ${up ? "up" : "dn"}`}>{signed(r.rate)}</div>}</div>
        </div>
        <div className="mt-2 text-sm">
          {[
            ["시가총액", c?.marketCap || "분석 중…"], ["유통주식", c?.float || "분석 중…"],
            ["거래대금", `${r.dollarVol != null ? money(r.dollarVol) : "–"}${r.volRatio != null ? ` · 거래량 +${r.volRatio.toLocaleString()}%` : ""}`],
            ["업종 · 국가", c ? `${c.sector} · ${c.country}` : "분석 중…"],
            ["그 뒤", r.after ? `다음 날 ${r.after.next == null ? "–" : signed(r.after.next)} · 지금 ${r.after.now == null ? "–" : signed(r.after.now)}` : "–"],
          ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-t border-[var(--line)] py-1.5 first:border-0"><span className="shrink-0 muted">{k}</span><b className="text-right">{v}</b></div>)}
        </div>
      </section>

      <Chart ticker={r.ticker} date={date} />

      {r.halts.length > 0 && <section className="card mb-3">
        <div className="mb-1 flex justify-between"><b>⏸ 거래정지 기록</b><span className="text-xs muted">ET (한국)</span></div>
        {r.halts.map((h, i) => <div key={i} className="flex gap-2 border-t border-[var(--line)] py-1.5 text-sm first-of-type:border-0">
          <span className={`h-fit shrink-0 rounded-md px-1.5 text-xs font-bold ${h.kind === "luld" ? "bg-[#fde7d2] text-[var(--amber)]" : "bg-[var(--red2)] text-[var(--red)]"}`}>{i + 1}</span>
          <div><b>{etHm(h.halt)} 정지 → {h.resume ? `${etHm(h.resume)} 재개` : "재개 미정"}</b> <span className="text-xs muted">(한국 {kstHm(h.halt)})</span>
            <div className="text-xs muted">{h.label} ({h.code}){i === 0 || r.halts[i - 1].code !== h.code ? ` · ${h.plain}` : ""}</div></div>
        </div>)}
      </section>}

      <section className="card mb-3">
        <div className="mb-1 flex items-center justify-between"><b>🔎 급등·정지 이유</b>{a && <span className={`tag ${KIND[a.analysis.kind]}`}>{a.analysis.kind}</span>}</div>
        {busy && <p className="flex items-center gap-2 text-sm font-bold"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--acc2)] border-t-[var(--acc)]" />{status || "뉴스·공시 확인 중…"}</p>}
        {err && <p className="text-sm text-[var(--red)]">{err}</p>}
        {a && <>
          <p>{a.analysis.summary}</p>
          {a.analysis.haltNote && <p className="mt-1 text-sm muted">⏸ {a.analysis.haltNote}</p>}
          {!busy && <button className="mt-2 text-xs font-bold text-[var(--acc)]" onClick={() => analyze(true)}>↻ 다시 분석</button>}
        </>}
      </section>

      {a && !!a.analysis.news.length && <section className="card mb-3"><b>📰 뉴스</b>
        {a.analysis.news.map((n, i) => <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="block border-t border-[var(--line)] py-1.5 text-sm first-of-type:border-0">
          <span className={`tag ${TONE[n.tone]} mr-1`}>{n.tone}</span>{n.title} <span className="text-xs muted">{n.source} · {n.date}</span></a>)}</section>}

      {a && !!a.analysis.risks.length && <section className="card mb-3"><b>⚠️ 리스크 체크</b>
        {a.analysis.risks.map(x => <div key={x.label} className="flex justify-between gap-3 border-t border-[var(--line)] py-1.5 text-sm first-of-type:border-0"><span className="muted">{x.label}</span><b className={`text-right ${LV[x.level]}`}>{x.value}</b></div>)}
        {!!a.analysis.sources.length && <details className="mt-2 text-sm"><summary className="muted">출처 {a.analysis.sources.length}건</summary>
          <ol className="mt-1 list-decimal pl-5">{a.analysis.sources.map((s, i) => <li key={i}><a className="text-[var(--acc)] underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ol></details>}
      </section>}

      <p className="card mb-3 !bg-[var(--amber2)] text-sm text-[#7a5413]">⚠️ 투자 권유가 아니에요. 정지가 반복된 급등주는 다음 날 크게 떨어지는 경우가 많아요.</p>
      <div className="flex gap-2">
        <button className={`btn flex-1 ${watched ? "btn-gray" : "btn-fill"}`} onClick={onWatch}>{watched ? "★ 관심 빼기" : "⭐ 관심 추가"}</button>
        <button className="btn btn-out flex-1" onClick={onAsk}>💬 질문하기</button>
      </div>
    </div>
  );
}
