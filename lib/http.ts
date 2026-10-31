// 외부 요청 공통: 시간 제한, 실패하면 null (화면은 가진 자료로 계속)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
export async function getText(url: string, opt: { headers?: Record<string, string>; timeout?: number; revalidate?: number } = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*", ...opt.headers }, signal: AbortSignal.timeout(opt.timeout ?? 10_000),
      ...(opt.revalidate ? { next: { revalidate: opt.revalidate } } : { cache: "no-store" as const }),
    });
    if (!res.ok) { console.warn(`[http] ${res.status} ${url.replace(/apiKey=[^&]+/, "apiKey=…")}`); return null; }
    return await res.text();
  } catch (e) { console.warn(`[http] fail ${url.replace(/apiKey=[^&]+/, "apiKey=…")}: ${(e as Error).message}`); return null; }
}
export async function getJson<T>(url: string, opt: Parameters<typeof getText>[1] = {}): Promise<T | null> {
  const t = await getText(url, opt);
  if (t == null) return null;
  try { return JSON.parse(t) as T; } catch { return null; }
}
/** 동시에 n개까지만 */
export async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k]); } }));
  return out;
}
