import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "税務・会計支援システム",
  description: "クラウド版 税務・会計支援システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
