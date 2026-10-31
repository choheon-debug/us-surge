// GET /api/day?d=2026-10-30 → 그날 거래정지 종목·급등주
import { day } from "@/lib/data";
export const maxDuration = 300;

export async function GET(req: Request) {
  const d = new URL(req.url).searchParams.get("d") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return Response.json({ error: "날짜 형식이 맞지 않아요." }, { status: 400 });
  return Response.json(await day(d));
}
