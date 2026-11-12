"use client";
// ＋ 매매 기록하기: 매수/매도, 티커, 가격·수량(수수료·환율 자동), 전략·마음, 손절가·목표가, 메모·차트 사진
import { useRef, useState } from "react";
import { uid } from "@/lib/store";
import { todayEt } from "@/lib/time";
import { openPhoto } from "./PhotoView";
import { krwToo, MOODS, usd, type JSettings, type Side, type Trade } from "@/lib/journal";

export type TradeInit = Partial<Trade> & { side: Side };
type Props = { init: TradeInit; settings: JSettings; fx: number; held: (t: string) => number; onSave: (t: Trade) => void; onDelete?: (id: string) => void; onBack: () => void; onAddStrategy: (s: string) => void };

const n = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;

/** 숫자 입력 칸 (컴포넌트 밖에 두어야 입력 중 칸이 다시 만들어지지 않는다) */
function Box({ label, v, set, unit, mode = "decimal", hint }: { label: string; v: string; set: (s: string) => void; unit?: string; mode?: "decimal" | "numeric"; hint?: string }) {
  return (
    <label className="block"><span className="mb-1 block text-sm font-bold">{label}</span>
      <span className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3"><input className="min-w-0 flex-1 bg-transparent py-2.5 text-[1.05rem] font-bold outline-none" inputMode={mode} value={v} onChange={e => set(e.target.value)} />{unit && <span className="shrink-0 text-sm muted">{unit}</span>}</span>
      {hint && <span className="mt-0.5 block text-xs muted">{hint}</span>}</label>
  );
}

export default function TradeForm({ init, settings, fx, held, onSave, onDelete, onBack, onAddStrategy }: Props) {
  const editing = !!init.id;
  const [side, setSide] = useState<Side>(init.side);
  const [ticker, setTicker] = useState(init.ticker ?? "");
  const [date, setDate] = useState(init.date ?? todayEt());
  const [time, setTime] = useState(init.time ?? "");
  const [price, setPrice] = useState(init.price ? String(init.price) : "");
  const [qty, setQty] = useState(init.qty ? String(init.qty) : "");
  const [fee, setFee] = useState(init.fee != null && editing ? String(init.fee) : "");
  const [rate, setRate] = useState(init.fx ? String(init.fx) : fx ? String(fx) : "");
  const [strategy, setStrategy] = useState(init.strategy ?? "");
  const [mood, setMood] = useState(init.mood ?? "");
  const [stop, setStop] = useState(init.stop ? String(init.stop) : "");
  const [target, setTarget] = useState(init.target ? String(init.target) : "");
  const [memo, setMemo] = useState(init.memo ?? "");
  const [photo, setPhoto] = useState(init.photo ?? "");
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);

  // 매수·매도는 서로 다른 기록: 버튼을 바꾸면 가격·수량·시각 등은 그쪽 칸으로 따로 보관한다 (종목·날짜·환율만 같이 씀)
  type Draft = { time: string; price: string; qty: string; fee: string; strategy: string; mood: string; stop: string; target: string; memo: string; photo: string };
  const drafts = useRef<Partial<Record<Side, Draft>>>({});
  const switchSide = (to: Side) => {
    if (to === side) return;
    drafts.current[side] = { time, price, qty, fee, strategy, mood, stop, target, memo, photo };
    const d = drafts.current[to] ?? { time: "", price: "", qty: to === "sell" && held(ticker.trim().toUpperCase()) ? String(held(ticker.trim().toUpperCase())) : "", fee: "", strategy: "", mood: "", stop: "", target: "", memo: "", photo: "" };
    setTime(d.time); setPrice(d.price); setQty(d.qty); setFee(d.fee); setStrategy(d.strategy); setMood(d.mood); setStop(d.stop); setTarget(d.target); setMemo(d.memo); setPhoto(d.photo);
    setSide(to); setErr("");
  };

  const t = ticker.trim().toUpperCase(), p = n(price), q = n(qty), amount = p * q;
  const autoFee = Math.round(amount * settings.feeRate) / 100, f = fee === "" ? autoFee : n(fee), r = n(rate);
  const total = side === "buy" ? amount + f : amount - f, have = t ? held(t) + (editing && init.side === "sell" && init.ticker === t ? init.qty ?? 0 : 0) : 0;
  const pctOf = (x: string) => (p && n(x) ? `${((n(x) / p - 1) * 100).toFixed(1)}%` : "");

  const save = () => {
    if (!/^[A-Z.\-]{1,8}$/.test(t)) return setErr("티커를 영어로 넣어 주세요 (예: KNRX)");
    if (!(p > 0) || !(q > 0)) return setErr("가격과 수량을 넣어 주세요");
    if (side === "sell" && q > have + 1e-9) return setErr(have ? `가진 수량(${have}주)보다 많이 팔 수 없어요` : "이 종목을 산 기록이 없어요. 먼저 매수를 기록해 주세요");
    onSave({ id: init.id ?? uid(), at: init.at ?? Date.now(), date, time: time || undefined, ticker: t, side, price: p, qty: q, fee: f, fx: r || undefined,
      strategy: strategy || undefined, mood: mood || undefined, stop: side === "buy" && n(stop) ? n(stop) : null, target: side === "buy" && n(target) ? n(target) : null, memo: memo.trim() || undefined, photo: photo || undefined });
  };
  const pickPhoto = (fl: File) => {
    const img = new Image(), url = URL.createObjectURL(fl);
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      setPhoto(c.toDataURL("image/jpeg", 0.7));
    };
    img.src = url;
  };
  return (
    <div>
      <button onClick={onBack} className="mb-2 text-sm font-bold muted">‹ 매매일지</button>
      <section className="card mb-3 space-y-3">
        <div className="flex items-baseline justify-between"><b className="text-lg">{editing ? "✏️ 매매 고치기" : "＋ 매매 기록"}</b><span className="text-xs muted">미국 동부시간 기준</span></div>
        <div className="grid grid-cols-2 gap-2">
          {(["buy", "sell"] as const).map(s => <button key={s} onClick={() => switchSide(s)} className={`rounded-xl py-2.5 font-extrabold ${side === s ? (s === "buy" ? "bg-[var(--up)] text-white" : "bg-[var(--dn)] text-white") : "bg-[#f1f2f4] muted"}`}>{s === "buy" ? "매수" : "매도"}</button>)}
        </div>
        <label className="block"><span className="mb-1 block text-sm font-bold">종목 (티커)</span>
          <input className="inp !py-2.5 text-[1.05rem] font-bold uppercase" value={ticker} onChange={e => setTicker(e.target.value)} placeholder="예: KNRX" autoCapitalize="characters" />
          {side === "sell" && t && <span className="mt-0.5 block text-xs muted">가진 수량: {have}주</span>}</label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="mb-1 block text-sm font-bold">날짜</span><input type="date" className="inp !py-2.5" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-sm font-bold">시각 (ET, 선택)</span><input type="time" className="inp !py-2.5" value={time} onChange={e => setTime(e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-2"><Box label="가격" v={price} set={setPrice} unit="$" /><Box label="수량" v={qty} set={setQty} unit="주" mode="numeric" /></div>
        <div className="grid grid-cols-2 gap-2">
          <Box label="수수료" v={fee} set={setFee} unit="$" hint={fee === "" ? `자동 ${settings.feeRate}% = ${usd(autoFee)}` : "직접 넣음"} />
          <Box label="환율" v={rate} set={setRate} unit="원/$" hint={fx ? `지금 ${fx.toLocaleString()}원` : "환율을 못 가져왔어요"} />
        </div>
        {amount > 0 && <div className="rounded-2xl bg-[var(--acc2)] p-3 text-center">
          <div className="text-xs muted">{side === "buy" ? "매수 금액 (수수료 포함)" : "매도 금액 (수수료 뺀)"}</div>
          <div className="text-xl font-extrabold">{usd(total)}<span className="text-base">{krwToo(total, r)}</span></div></div>}
        <div><span className="mb-1 block text-sm font-bold">왜 {side === "buy" ? "샀나요" : "팔았나요"}? (전략)</span>
          <div className="flex flex-wrap gap-1.5">
            {settings.strategies.map(s => <button key={s} onClick={() => setStrategy(strategy === s ? "" : s)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${strategy === s ? "bg-[var(--acc)] text-white" : "bg-[#f1f2f4] muted"}`}>{s}</button>)}
            <button className="rounded-full bg-[#f1f2f4] px-3 py-1.5 text-sm font-bold muted" onClick={() => { const s = prompt("새 전략 이름")?.trim(); if (s) { onAddStrategy(s); setStrategy(s); } }}>＋</button>
          </div></div>
        <div><span className="mb-1 block text-sm font-bold">그때 마음</span>
          <div className="flex flex-wrap gap-1.5">{MOODS.map(m => <button key={m} onClick={() => setMood(mood === m ? "" : m)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${mood === m ? "bg-[var(--acc)] text-white" : "bg-[#f1f2f4] muted"}`}>{m}</button>)}</div></div>
        {side === "buy" && <div className="grid grid-cols-2 gap-2"><Box label="손절가" v={stop} set={setStop} unit={pctOf(stop) || "$"} /><Box label="목표가" v={target} set={setTarget} unit={pctOf(target) || "$"} /></div>}
        <label className="block"><span className="mb-1 block text-sm font-bold">메모</span>
          <textarea className="inp min-h-[4.5rem]" value={memo} onChange={e => setMemo(e.target.value)} placeholder="예: FDA 뉴스 후 첫 눌림, 거래량 확인" /></label>
        <div className="flex items-center gap-2">
          <button className="btn btn-gray !py-2 text-sm" onClick={() => file.current?.click()}>📷 차트 사진 {photo ? "바꾸기" : "넣기"}</button>
          {photo && <><button onClick={() => openPhoto(photo, `${t || "차트"} 사진`)} aria-label="차트 사진 크게 보기" className="relative"><img src={photo} alt="차트 사진" className="h-12 rounded-lg" /><span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[0.6rem] text-white">🔍</span></button><button className="text-sm muted" onClick={() => setPhoto("")}>빼기</button></>}
          <input ref={file} type="file" accept="image/*" hidden onChange={e => { const fl = e.target.files?.[0]; e.target.value = ""; if (fl) pickPhoto(fl); }} />
        </div>
        {err && <p className="text-sm text-[var(--red)]">{err}</p>}
        <p className="text-xs muted">한 번에 한 건씩 기록해요. 산 것을 먼저 저장하고, 팔 때 다시 <b>＋ 매매 기록하기 → 매도</b>로 따로 기록하세요.</p>
        <button className="btn btn-fill w-full" onClick={save}>저장</button>
        {editing && onDelete && <button className="btn btn-gray w-full" onClick={() => { if (confirm("이 기록을 지울까요?")) onDelete(init.id!); }}>🗑️ 지우기</button>}
      </section>
    </div>
  );
}
