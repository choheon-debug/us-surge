// 📷 차트 사진 크게 보기: 화면 전체에 띄우고 두 손가락으로 확대, 저장·공유도 돼요
export function openPhoto(src: string, title = "차트 사진") {
  if (typeof document === "undefined" || !src) return;
  const w = document.createElement("div");
  w.setAttribute("role", "dialog");
  w.style.cssText = "position:fixed;inset:0;z-index:100;background:#000;display:flex;flex-direction:column";
  w.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;color:#fff">
      <b style="flex:1;font-size:1rem">${title.replace(/[<>&]/g, "")}</b>
      <button data-save style="border:0;border-radius:12px;background:#fff;color:#111;font-weight:800;padding:9px 12px">💾 저장</button>
      <button data-close aria-label="닫기" style="border:0;border-radius:12px;background:#374151;color:#fff;font-weight:800;padding:9px 14px">✕ 닫기</button>
    </div>
    <div style="flex:1;overflow:auto;touch-action:pinch-zoom pan-x pan-y;-webkit-overflow-scrolling:touch;display:flex;align-items:center;justify-content:center">
      <img src="${src}" alt="${title.replace(/["<>&]/g, "")}" style="max-width:100%;max-height:100%;object-fit:contain;cursor:zoom-in">
    </div>
    <p style="margin:0;padding:8px 12px calc(env(safe-area-inset-bottom,0px) + 12px);color:#9ca3af;font-size:.8rem;text-align:center">두 손가락으로 벌리면 크게 볼 수 있어요 · 사진을 누르면 실제 크기</p>`;
  const img = w.querySelector("img") as HTMLImageElement;
  let big = false;
  img.onclick = () => { big = !big; img.style.maxWidth = big ? "none" : "100%"; img.style.maxHeight = big ? "none" : "100%"; img.style.cursor = big ? "zoom-out" : "zoom-in"; };
  const close = () => { w.remove(); document.removeEventListener("keydown", esc); };
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  (w.querySelector("[data-close]") as HTMLElement).onclick = close;
  (w.querySelector("[data-save]") as HTMLElement).onclick = async () => {
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], `${title.replace(/[\\/:*?"<>|\s]+/g, "_")}.jpg`, { type: blob.type || "image/jpeg" });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    } catch { /* 공유 창을 닫은 경우 */ }
  };
  document.addEventListener("keydown", esc);
  document.body.appendChild(w);
}
