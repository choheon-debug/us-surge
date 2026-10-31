// 미국 급등주·거래정지 자료 형태
export type HaltEvent = { code: string; label: string; plain: string; kind: "luld" | "news" | "reg" | "other"; halt: string; resume: string | null };   // halt·resume: ISO
export type Row = {
  ticker: string; name: string; market: string;
  price: number | null; rate: number | null;            // 그날 종가(또는 지금 값)·등락률 %
  dollarVol: number | null; volRatio: number | null;    // 거래대금($)·전일 대비 거래량 증가율 %
  halts: HaltEvent[]; haltedNow: boolean;
  after?: { next: number | null; now: number | null };  // 그날 종가 대비 다음 거래일·지금 등락률
};
export type Day = {
  date: string; live: boolean; asOf: string;
  halts: Row[];      // 그날 거래정지가 있었던 종목
  gainers: Row[];    // +20% 이상 (거래대금 $1M 이상)
  notes: string[];   // 자료를 못 가져온 부분 안내
};
export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
