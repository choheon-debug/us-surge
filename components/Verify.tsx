"use client";
// 📊 검증: 열어 본 지난 날짜의 정지·급등 종목을 다음 날 샀다면 (이 휴대폰에 모은 기록으로 계산) + 상태 확인
import { useState } from "react";
import { signed } from "@/lib/time";

export type Seen = Record<string, { gainers: number; rows: { t: string; rate: number | null; luld: number; other: number; next: number; now: number | null }[] }>;

export default function Verify({ seen }: { seen: Seen }) {
  const rows = Object.entries(seen).flatMap(([d, s]) => s.rows.map(r => ({ ...r, d })));
  const g = (name: string, l: typeof rows) => {
    const withNow = l.filter(r => r.now != null);
    return { name, n: l.length, next: l.length ? l.reduce((a, r) => a + r.next, 0) / l.length : 0,
      now: withNow.length ? withNow.reduce((a, r) => a + r.now!, 0) / withNow.length : 0, up: l.length ? l.filter(r => r.next > 0).length / l.length : 0 };
  };
  const groups = [
    g("정지 있었던 종목 전체", rows.filter(r => r.luld + r.other > 0)), g("변동성 정지 3번 이상", rows.filter(r => r.luld >= 3)),
    g("뉴스·규제 정지", rows.filter(r => r.other > 0)), g("+20% 이상 급등", rows.filter(r => (r.rate ?? 0) >= 20)), g("+100% 이상", rows.filter(r => (r.rate ?? 0) >= 100)),
  ].filter(x => x.n);
  const days = Object.keys(seen).length;
  return (
    <div className="space-y-3">
      <section className="card">
        <b>급등·정지한 날 종가에 샀다면</b>
        <p className="text-xs muted">달력에서 열어 본 지난 날짜 {days}일의 종목 {rows.length}개로 계산 (이 휴대폰에 모음). 많이 열어 볼수록 정확해져요.</p>
        {!groups.length ? <p className="mt-2 text-sm muted">아직 기록이 없어요. 📅 급등 탭에서 지난 날짜를 몇 개 눌러 보세요.</p> : <>
          <table className="mt-2 w-full text-center text-sm num [&_td]:border-t [&_td]:border-[var(--line)] [&_td]:py-1.5 [&_td:first-child]:text-left">
            <thead><tr className="text-xs muted"><th className="text-left font-bold">종류</th><th className="font-bold">개수</th><th className="font-bold">다음 날</th><th className="font-bold">지금</th></tr></thead>
            <tbody>{groups.map(x => <tr key={x.name}><td>{x.name}</td><td>{x.n}</td><td className={x.next < 0 ? "dn" : "up"}>{signed(x.next)}</td><td className={x.now < 0 ? "dn" : "up"}>{signed(x.now)}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-sm">다음 날 오른 비율 <b>{Math.round(groups[0].up * 100)}%</b> <span className="muted">(10번 중 {Math.round(groups[0].up * 10)}번 정도)</span></p>
        </>}
      </section>
      <Status />
    </div>
  );
}

function Status() {
  const [t, setT] = useState("");
  return (
    <section className="card text-sm">
      <b>⚙️ 상태 확인</b>
      <button className="btn btn-gray mt-2 w-full text-sm" onClick={async () => { setT("시험 중… (20초쯤)"); try { setT(await (await fetch("/api/test")).text()); } catch { setT("시험하지 못했어요"); } }}>자료 연결 시험</button>
      {t && <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-[#f4f5f7] p-2 text-xs">{t}</pre>}
    </section>
  );
}
