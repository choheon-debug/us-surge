"use client";
// 💬 질문: 고른 날짜의 거래정지·급등 목록을 바탕으로 AI가 뉴스·공시를 검색해 쉬운 말로 답한다 (예측·매수 권유는 안 함)
import { useEffect, useRef, useState } from "react";
import { useStored } from "@/lib/store";
import { prettyDate } from "@/lib/time";
import type { ChatMsg } from "@/lib/claude";
import type { Day } from "@/lib/types";

const EXAMPLES = ["오늘 T1(뉴스 대기)로 멈춘 종목은 왜 멈췄어?", "LUDP 변동성 정지는 어떻게 걸려?", "오늘 정지가 가장 많이 걸린 종목은 왜 올랐어?", "역분할·ATM 희석이 뭐야? 왜 위험해?", "내 매매일지 보고 고칠 습관 알려 줘"];

type Props = { date: string; day: Day | null; journal?: string; goSurge: () => void; preset?: string; clearPreset?: () => void };

export default function Chat({ date, day, journal, goSurge, preset, clearPreset }: Props) {
  const [msgs, setMsgs] = useStored<ChatMsg[]>("us.chat", []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);
  useEffect(() => { if (preset) { setText(preset); clearPreset?.(); } }, [preset, clearPreset]);

  const ask = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    const history: ChatMsg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setText(""); setBusy(true); setErr(""); setStatus("");
    let answer = "";
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, journal: journal || undefined, messages: history.slice(-12) }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error || "질문을 보내지 못했어요");
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
          if (e.type === "error") throw new Error(e.message);
          if (e.type === "status") setStatus(e.text);
          if (e.type === "text") { answer += e.text; setMsgs([...history, { role: "assistant", content: answer }]); }
        }
      }
      if (!answer.trim()) throw new Error("답변이 비어 있어요. 다시 물어봐 주세요.");
    } catch (e) {
      setErr((e as Error).message);
      setMsgs(answer.trim() ? [...history, { role: "assistant", content: answer }] : history);
    } finally { setBusy(false); setStatus(""); }
  };

  return (
    <div className="space-y-3">
      <section className="card flex items-center justify-between gap-2 text-sm">
        <span><b>{prettyDate(date)}</b> 정지 {day?.halts.length ?? 0} · 급등 {day?.gainers.length ?? 0}종목 기준</span>
        <button className="shrink-0 font-bold text-[var(--acc)]" onClick={goSurge}>날짜 바꾸기</button>
      </section>

      {!msgs.length && (
        <section className="card text-sm">
          <b>이렇게 물어보세요</b>
          <div className="mt-2 flex flex-col gap-1.5">{EXAMPLES.map(q => <button key={q} onClick={() => ask(q)} className="rounded-xl bg-[#f1f2f4] px-3 py-2 text-left">{q}</button>)}</div>
          <p className="mt-2 text-xs muted">AI가 보도자료·SEC 공시를 검색해서 답하고 출처를 적어요. 앞날을 예측하거나 사라고 권하지 않아요.</p>
        </section>
      )}

      {msgs.map((m, i) => (
        <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
          <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[0.95rem] leading-relaxed ${m.role === "user" ? "bg-[var(--acc)] text-white" : "card !rounded-2xl"}`}>
            {m.content.trim() ? <Rich s={m.content.trimStart()} /> : <span className="muted">{status || "생각하는 중…"}</span>}
          </div>
        </div>
      ))}
      {err && <p className="text-sm text-[var(--red)]">{err}</p>}
      <div ref={end} />

      <div className="sticky bottom-2 flex gap-2 rounded-2xl bg-white p-2 shadow-md">
        <textarea className="inp min-h-[2.75rem] flex-1 resize-none" rows={1} placeholder="질문을 입력하세요" value={text}
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(text); } }} />
        <button className="btn btn-fill shrink-0 !px-4" disabled={busy || !text.trim()} onClick={() => ask(text)}>{busy ? "…" : "보내기"}</button>
      </div>
      {!!msgs.length && <button className="w-full text-xs muted" disabled={busy} onClick={() => { if (confirm("대화를 지울까요?")) setMsgs([]); }}>대화 지우고 새로 시작</button>}
      <p className="text-xs muted">AI 답변은 참고용이에요. 매수·매도를 권하지 않고, 앞날을 예측하지 않아요.</p>
    </div>
  );
}

/** **굵게**만 살린 간단 표시 */
function Rich({ s }: { s: string }) {
  return <>{s.split(/(\*\*[^*]+\*\*)/g).map((t, i) => t.startsWith("**") && t.endsWith("**") ? <b key={i}>{t.slice(2, -2)}</b> : t.replace(/^#+\s*/gm, ""))}</>;
}
