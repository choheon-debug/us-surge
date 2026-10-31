// 나스닥 거래정지 목록 (Nasdaq Trader RSS, 키 없음): 그날 정지된 모든 미국 상장 종목·사유 코드·정지/재개 시각(ET)
import { getText } from "./http";
import { etToIso, lastTradingDay, todayEt } from "./time";
import type { HaltEvent } from "./types";

/** 정지 코드 → 쉬운 말 */
export const HALT_CODES: Record<string, { label: string; plain: string; kind: HaltEvent["kind"] }> = {
  LUDP: { label: "변동성 정지", plain: "5분 안에 가격이 너무 많이 움직여 거래소가 자동으로 5분 멈춤", kind: "luld" },
  LUDS: { label: "변동성 정지", plain: "가격이 정해진 범위에 걸쳐 자동으로 잠깐 멈춤", kind: "luld" },
  T1: { label: "뉴스 대기 정지", plain: "회사가 중요한 발표를 앞둬 거래소가 멈춤 (재개 시각 미정)", kind: "news" },
  T2: { label: "뉴스 발표", plain: "중요 뉴스가 발표되어 내용을 알리는 동안 멈춤", kind: "news" },
  T3: { label: "뉴스·재개 안내", plain: "뉴스 확인이 끝나 곧 재개한다는 안내", kind: "news" },
  T5: { label: "단일 종목 급변 정지", plain: "한 종목 가격이 짧은 시간에 크게 움직여 멈춤", kind: "luld" },
  T6: { label: "비정상 거래 정지", plain: "이상한 주문·거래가 보여 거래소가 멈춤", kind: "reg" },
  T12: { label: "추가 정보 요청", plain: "거래소가 회사에 추가 설명을 요구하며 멈춤 (오래 갈 수 있음)", kind: "reg" },
  H4: { label: "상장 요건 미충족", plain: "상장 유지 요건을 못 지켜 멈춤", kind: "reg" },
  H9: { label: "공시 미제출", plain: "정기 보고서를 제때 내지 않아 멈춤", kind: "reg" },
  H10: { label: "SEC 거래정지", plain: "미국 증권거래위원회가 거래를 멈춤 (보통 10일)", kind: "reg" },
  H11: { label: "규제 우려 정지", plain: "규제상 문제가 있어 멈춤", kind: "reg" },
  M: { label: "시장 전체 정지", plain: "시장 전체 서킷브레이커", kind: "other" },
  MWC1: { label: "시장 서킷브레이커 1단계", plain: "시장 전체가 7% 떨어져 멈춤", kind: "other" },
  IPO1: { label: "신규 상장 대기", plain: "신규 상장 첫 거래 전 대기", kind: "other" },
  D: { label: "상장 폐지", plain: "상장에서 빠짐", kind: "reg" },
  O1: { label: "운영상 정지", plain: "거래소 운영 문제로 멈춤", kind: "other" },
};

const MKT: Record<string, string> = { Q: "NASDAQ", N: "NYSE", A: "NYSE American", P: "NYSE Arca", Z: "Cboe BZX" };

export type HaltItem = { ticker: string; name: string; market: string } & HaltEvent;

const tag = (item: string, name: string) =>
  item.match(new RegExp(`<ndaq:${name}>(?:<!\\[CDATA\\[)?([^<\\]]*)(?:\\]\\]>)?</ndaq:${name}>`, "i"))?.[1]?.trim() ?? "";
const toYmd = (mdy: string) => { const [m, d, y] = mdy.split("/"); return y && m && d ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : ""; };

/** 그날(ET)의 거래정지 목록. 지난 날짜는 오래 저장, 오늘은 1분 */
export async function haltsOn(date: string): Promise<HaltItem[] | null> {
  const today = date === todayEt();
  const [y, m, d] = date.split("-");
  const base = "https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts";
  // 주말·새벽에는 "오늘" 목록에 마지막 거래일 정지가 들어 있으니 그 날짜는 두 목록을 합친다 (지난 날짜 목록은 늦게 채워질 수 있음)
  const urls = today ? [base] : date === lastTradingDay() ? [`${base}&haltdate=${m}${d}${y}`, base] : [`${base}&haltdate=${m}${d}${y}`];
  const xmls = await Promise.all(urls.map(u => getText(u, { revalidate: today || u === base ? 60 : 7 * 86400, timeout: 12_000 })));
  if (xmls.every(x => x == null)) return null;
  const xml = xmls.filter(Boolean).join("");
  const seen = new Set<string>();
  const out: HaltItem[] = [];
  for (const item of xml.split(/<item>/i).slice(1)) {
    const hd = toYmd(tag(item, "HaltDate"));
    if (hd !== date) continue;
    const code = tag(item, "ReasonCode").toUpperCase();
    const info = HALT_CODES[code] ?? { label: code || "기타 정지", plain: "거래소가 거래를 멈춤", kind: "other" as const };
    const rd = toYmd(tag(item, "ResumptionDate")), rt = tag(item, "ResumptionTradeTime");
    const halt = etToIso(hd, tag(item, "HaltTime") || "00:00:00");
    if (!halt) continue;   // 시각을 읽을 수 없는 줄은 건너뛴다
    const sym = tag(item, "IssueSymbol").toUpperCase();
    if (seen.has(sym + halt)) continue;
    seen.add(sym + halt);
    out.push({
      ticker: tag(item, "IssueSymbol").toUpperCase(), name: tag(item, "IssueName"), market: tag(item, "Market") || MKT[tag(item, "Mkt")] || tag(item, "Mkt"),
      code, label: info.label, plain: info.plain, kind: info.kind,
      halt, resume: rd && rt ? etToIso(rd, rt) : null,
    });
  }
  return out.sort((a, b) => a.halt.localeCompare(b.halt));
}
