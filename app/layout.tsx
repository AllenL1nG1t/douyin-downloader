import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "抖音无水印解析",
  description: "粘贴抖音分享链接，解析并下载无水印视频、图集和背景音乐",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="referrer" content="no-referrer" />
      </head>
      <body>{children}</body>
    </html>
  );
}
