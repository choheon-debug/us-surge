"use client";
// ⭐ 관심종목: 이 휴대폰에만 저장
import { prettyDate, signed } from "@/lib/time";
import type { WatchItem } from "./App";

export default function Watch({ items, onOpen, onRemove }: { items: WatchItem[]; onOpen: (w: WatchItem) => void; onRemove: (t: string) => void }) {
  if (!items.length) return <p className="card text-center text-sm muted">관심종목이 없어요. 종목 화면에서 ⭐ 관심 추가를 누르세요.</p>;
  return (
    <section className="card">
      <b>⭐ 관심종목 {items.length}개</b>
      {items.map(w => (
        <div key={w.ticker} className="flex items-center justify-between gap-2 border-t border-[var(--line)] py-2 first-of-type:border-0">
          <button className="min-w-0 text-left" onClick={() => onOpen(w)}><b>{w.ticker}</b> <span className="text-xs muted">{w.name}</span>
            <div className="text-xs muted">{prettyDate(w.date)}에 담음{w.rate != null ? ` · 그날 ${signed(w.rate)}` : ""}{w.price != null ? ` · $${w.price}` : ""}</div></button>
          <button className="shrink-0 text-sm muted" onClick={() => onRemove(w.ticker)}>빼기</button>
        </div>
      ))}
    </section>
  );
}
