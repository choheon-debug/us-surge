// 미국 동부시간(ET) 기준 증시 날짜. 한국 시간도 함께 보여 준다
const fmt = (tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", ...o });
const ymdET = fmt("America/New_York", { year: "numeric", month: "2-digit", day: "2-digit" });
const hmET = fmt("America/New_York", { hour: "2-digit", minute: "2-digit" });
const hmKST = fmt("Asia/Seoul", { hour: "2-digit", minute: "2-digit" });
export const etDate = (t: number | string | Date = Date.now()) => ymdET.format(new Date(t));
export const etHm = (t: number | string | Date = Date.now()) => hmET.format(new Date(t));
export const kstHm = (t: number | string | Date) => hmKST.format(new Date(t));
export const todayEt = () => etDate();
const WD = "일월화수목금토";
export const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const prettyDate = (date: string) => `${+date.slice(5, 7)}월 ${+date.slice(8, 10)}일 (${WD[weekday(date)]})`;

/** 미국 증시 휴장일 2026 (NYSE·나스닥) */
export const HOLIDAYS = new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]);
export const isTradingDay = (date: string) => ![0, 6].includes(weekday(date)) && !HOLIDAYS.has(date);
export const isHoliday = (date: string) => HOLIDAYS.has(date) && ![0, 6].includes(weekday(date));
export function shiftTradingDay(date: string, n: 1 | -1) {
  let d = new Date(`${date}T12:00:00Z`).getTime();
  for (;;) { d += n * 86400_000; const s = new Date(d).toISOString().slice(0, 10); if (isTradingDay(s)) return s; }
}
/** 가장 최근 거래일 (오늘이 거래일이면 오늘) */
export const lastTradingDay = () => (isTradingDay(todayEt()) ? todayEt() : shiftTradingDay(todayEt(), -1));
/** 정규장 09:30~16:00 ET */
export function marketOpen(now = Date.now()) {
  const hm = etHm(now);
  return isTradingDay(etDate(now)) && hm >= "09:30" && hm < "16:00";
}
/** "10:32:15" (ET, 그 날짜) → 실제 시각 ISO */
export function etToIso(date: string, hms: string) {
  for (const off of ["-04:00", "-05:00"]) {
    const iso = `${date}T${hms.padStart(8, "0")}${off}`, t = new Date(iso);
    if (etDate(t) === date && etHm(t) === hms.slice(0, 5).padStart(5, "0")) return t.toISOString();
  }
  return new Date(`${date}T${hms}-05:00`).toISOString();
}
export const usd = (x: number) => (x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(2) : x.toFixed(4)).replace(/\.?0+$/, m => (m.startsWith(".") && m.length > 3 ? m : m));
export function money(x: number) {
  if (x >= 1e9) return `$${(x / 1e9).toFixed(1)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(1)}M`;
  if (x >= 1e3) return `$${(x / 1e3).toFixed(0)}K`;
  return `$${Math.round(x)}`;
}
export const signed = (x: number, d = 1) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}%`;
