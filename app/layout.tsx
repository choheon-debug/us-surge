import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "미국 급등주·매매일지", description: "미국 주식 급등주·거래정지 종목 분석과 나의 매매일지(손익·통계·복기)." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#eaeaea" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body className="min-h-dvh">{children}</body></html>;
}
