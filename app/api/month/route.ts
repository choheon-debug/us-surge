// GET /api/month?m=2026-10 → 날짜별 거래정지 종목 수
import { monthHalts } from "@/lib/data";
export const maxDuration = 300;

export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get("m") ?? "";
  if (!/^\d{4}-\d{2}$/.test(m)) return Response.json({ error: "달 형식이 맞지 않아요." }, { status: 400 });
  return Response.json({ halts: await monthHalts(m) });
}
