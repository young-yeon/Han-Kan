import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "한칸 — 있는 재료로, 근사한 한 끼",
  description: "내 재료와 취향을 아는 AI 식사 도우미, 한칸. 사진으로 냉장고를 정리하고 나에게 맞는 한 끼를 만나세요.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg?v=hankan",
    shortcut: "/favicon.svg?v=hankan",
    apple: "/icon-192.png?v=hankan",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
