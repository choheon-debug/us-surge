// AI: ① 종목 급등·정지 이유 분석 (웹 검색 → 정해진 형식) ② 💬 질문
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());
export const claudeReady = () => !!process.env.ANTHROPIC_API_KEY;
export class ClaudeError extends Error {}

function korean(err: unknown): Error {
  if (err instanceof ClaudeError) return err;
  console.error(err);
  if (err instanceof Anthropic.AuthenticationError) return new ClaudeError("Anthropic API 키가 맞지 않아요. Vercel의 ANTHROPIC_API_KEY를 확인해 주세요.");
  if (err instanceof Anthropic.RateLimitError) return new ClaudeError("요청이 많아 잠시 막혔어요. 1분 뒤 다시 해 주세요.");
  if (err instanceof Anthropic.BadRequestError && /credit|balance/i.test(err.message)) return new ClaudeError("Anthropic 크레딧이 부족해요.");
  if (err instanceof Anthropic.PermissionDeniedError) return new ClaudeError("이 API 키로는 웹 검색을 쓸 수 없어요. Anthropic Console 설정에서 웹 검색을 켜 주세요.");
  if (err instanceof Anthropic.NotFoundError) return new ClaudeError(`AI 모델(${MODEL})을 찾지 못했어요.`);
  // 원인을 알 수 있게 상태 번호와 짧은 내용을 함께 보여 준다
  if (err instanceof Anthropic.APIError) return new ClaudeError(`AI 서버 오류 (${err.status ?? "?"}): ${String(err.message).slice(0, 160)}`);
  return new ClaudeError(`AI 분석 중 문제가 생겼어요: ${String((err as Error)?.message ?? err).slice(0, 160)}`);
}

/** 웹 검색을 쓰는 대화 한 번 (검색 도구 버전 대체, pause_turn 이어 받기) */
async function searchLoop(system: string, messages: Anthropic.Beta.BetaMessageParam[], maxUses: number, onText?: (t: string) => void, onSearch?: () => void) {
  let toolType: "web_search_20260209" | "web_search_20250305" = "web_search_20260209";
  let text = "";
  for (let round = 0; round < 4; round++) {
    let msg: Anthropic.Beta.BetaMessage;
    try {
      const stream = anthropic().beta.messages.stream({ model: MODEL, max_tokens: 8000, system, messages, tools: [{ type: toolType, name: "web_search", max_uses: maxUses }] });
      if (onText) stream.on("text", onText);
      stream.on("streamEvent", e => { if (e.type === "content_block_start" && e.content_block.type === "server_tool_use") onSearch?.(); });
      msg = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError && toolType === "web_search_20260209" && /web_search/.test(err.message)) { toolType = "web_search_20250305"; round--; continue; }
      throw korean(err);
    }
    text += msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map(b => b.text).join("");
    if (msg.stop_reason !== "pause_turn") return text;
    messages = [...messages, { role: "assistant", content: msg.content }];
  }
  return text;
}

/* ---------- ① 종목 분석 ---------- */
export const AnalysisSchema = z.object({
  kind: z.enum(["호재 발표", "뉴스", "테마", "이유 불명", "악재"]),
  summary: z.string(),             // 급등·정지 이유 2~3문장
  haltNote: z.string(),            // 정지가 있었다면 왜 걸렸는지 한두 문장 (없으면 빈 문자열)
  company: z.object({ name: z.string(), sector: z.string(), country: z.string(), marketCap: z.string(), float: z.string() }),
  news: z.array(z.object({ title: z.string(), source: z.string(), date: z.string(), url: z.string(), tone: z.enum(["긍정", "부정", "중립"]) })).max(4),
  risks: z.array(z.object({ label: z.string(), value: z.string(), level: z.enum(["ok", "mid", "bad"]) })).max(6),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).max(10),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

const ANALYZE = `당신은 미국 주식 분석가다. 사용자는 한국인 초보자다. 웹 검색으로 확인한 최신 사실만 쓰고, 쉬운 한국어로 짧게 쓴다.
주어진 종목이 그 날짜에 왜 급등했는지(또는 거래가 멈췄는지) 조사한다. 보도자료(GlobeNewswire, PR Newswire, Business Wire, Accesswire), SEC EDGAR(8-K, S-1, S-3, 424B, 10-Q/10-K), 나스닥 공지를 우선한다.
- kind: 이유 종류. 확인 못 하면 "이유 불명".
- summary: 2~3문장. 무엇이 발표됐는지, 유통주식이 적어 크게 움직였는지 등.
- haltNote: 정지 기록이 있으면 왜 걸렸는지 쉬운 말로 1~2문장 (LUDP는 가격 급변으로 자동 5분 정지, T1/T12/H10은 뉴스·규제 정지). 없으면 "".
- company: 회사 정식 이름, 업종(한국어), 국가(본사), 시가총액(예 "$38M"), 유통주식(예 "4.1M주"). 모르면 "확인 안 됨".
- news: 그 날짜 전후 최신 기사 최대 4개 (제목은 한국어로 짧게 번역, 원문 URL).
- risks: 초소형주 체크 4~6개 — 희석(증자·ATM·워런트·전환사채), 역분할(최근 1년), 상장유지 기준(최저가 $1 등) 통지, 계속기업 불확실성, 재판매 등록(S-1/S-3 resale), 최근 거래정지 이력. value는 짧게(예 "S-3 등록 · ATM 가능"), level: ok 문제없음/mid 주의/bad 위험.
- 출처 없는 숫자, 매수·매도 권유, 앞날 예측 금지.
반드시 아래 JSON 하나만 \`\`\`json 블록으로 출력.
{"kind":"이유 불명","summary":"","haltNote":"","company":{"name":"","sector":"","country":"","marketCap":"","float":""},"news":[],"risks":[],"sources":[]}`;

export async function analyze(ticker: string, date: string, facts: string, onSearch: () => void): Promise<Analysis> {
  const text = await searchLoop(ANALYZE, [{ role: "user", content: `종목: ${ticker}\n날짜(미국 동부): ${date}\n오늘: ${new Date().toISOString()}\n앱이 가진 자료:\n${facts}` }], 7, undefined, onSearch);
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try { return AnalysisSchema.parse(JSON.parse(block)); } catch {}
  try {   // 형식이 어긋나면 검색 없이 한 번 다시 정리
    const res = await anthropic().messages.parse({
      model: MODEL, max_tokens: 6000, output_config: { format: zodOutputFormat(AnalysisSchema) },
      messages: [{ role: "user", content: `아래 분석을 형식에 맞게 다시 정리해 주세요. 내용을 지어내지 마세요.\n\n${text}` }],
    });
    if (res.parsed_output) return res.parsed_output;
  } catch (err) { throw korean(err); }
  throw new ClaudeError("분석 결과 형식이 맞지 않아요. 다시 해 주세요.");
}

/* ---------- ② 질문 ---------- */
export type ChatMsg = { role: "user" | "assistant"; content: string };
const CHAT = `당신은 "미국 급등주·거래정지" 앱의 상담 도우미다. 사용자는 한국인 주식 초보자다. 한국어로, 쉬운 말로, 짧게(휴대폰 5~12줄) 답한다.
- 종목의 급등·정지 이유는 반드시 웹 검색으로 확인하고 답 끝에 "출처:"를 짧게 적는다. 확인 못 하면 "확인되지 않음". 지어내지 않는다.
- 정지 코드(LUDP, T1, T12, H10 등), 희석, 역분할, ATM, 워런트, 상장유지 통지 같은 용어는 한 줄로 풀어 설명한다.
- 매수·매도를 권하지 않는다. 앞날을 물으면 예측하지 말고 과거 흐름·위험 요소 같은 사실을 알려 준다.
- 시각은 미국 동부시간(ET)과 한국 시간을 함께 쓴다. 표 대신 짧은 줄 목록. 굵게는 **…**만.`;

export async function chat(context: string, history: ChatMsg[], onText: (t: string) => void, onSearch: () => void) {
  await searchLoop(`${CHAT}\n\n지금: ${new Date().toISOString()}\n${context}`, history.map(m => ({ role: m.role, content: m.content })), 5, onText, onSearch);
}
