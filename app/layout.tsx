import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "미국 급등주·거래정지", description: "미국 주식 급등주와 거래정지(halt) 종목, 정지 이유와 그 뒤 결과를 정리합니다." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#eaeaea" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body className="min-h-dvh">{children}</body></html>;
}
