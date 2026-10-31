"use client";
// 달력: 날짜 칸에 ⏸ 거래정지 종목 수 · ▲ 급등(+20%) 종목 수(열어 본 날짜). 주말·휴장일 표시
import { isHoliday, todayEt } from "@/lib/time";

type Props = { month: string; setMonth: (m: string) => void; date: string; setDate: (d: string) => void; halts: Record<string, number>; gainers: Record<string, number> };

export default function Calendar({ month, setMonth, date, setDate, halts, gainers }: Props) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayEt();
  const move = (d: number) => setMonth(new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7));
  return (
    <section className="card mb-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => move(-1)} className="h-9 w-9 rounded-xl bg-[#f1f2f4] font-bold" aria-label="이전 달">‹</button>
        <b className="text-lg">{y}년 {m}월</b>
        <button onClick={() => move(1)} className="h-9 w-9 rounded-xl bg-[#f1f2f4] font-bold" aria-label="다음 달">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {"일월화수목금토".split("").map((w, i) => <div key={w} className={`text-xs font-bold ${i === 0 ? "text-[var(--red)]" : i === 6 ? "text-[#2f6fd6]" : "muted"}`}>{w}</div>)}
        {Array.from({ length: first }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, "0")}`, wd = (first + i) % 7, sel = d === date, hol = isHoliday(d), h = halts[d], g = gainers[d];
          return (
            <button key={d} onClick={() => setDate(d)}
              className={`flex h-14 flex-col items-center justify-center rounded-xl text-[0.95rem] font-semibold leading-tight
                ${sel ? "bg-[var(--acc)] text-white" : wd === 0 || hol ? "text-[var(--red)]" : wd === 6 ? "text-[#2f6fd6]" : ""}
                ${d === today && !sel ? "ring-2 ring-[var(--acc)] ring-inset" : ""}`}>
              {i + 1}
              {h != null && <span className={`text-[0.6rem] font-extrabold ${sel ? "text-white" : "text-[var(--amber)]"}`}>⏸{h}</span>}
              {g != null && <span className={`text-[0.6rem] ${sel ? "text-white" : "muted"}`}>▲{g}</span>}
              {hol && <span className={`text-[0.6rem] ${sel ? "text-white" : "text-[#9aa0a8]"}`}>휴장</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs muted"><b className="text-[var(--amber)]">⏸</b> 거래정지 종목 수 · ▲ +20% 넘게 오른 종목 수(열어 본 날짜) · 미국 동부시간 기준</p>
    </section>
  );
}
