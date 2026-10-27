// 抖音链接与域名相关的公共工具

export const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// 允许代理下载的域名后缀，防止 /api/download 被当成任意 URL 的开放代理
const ALLOWED_HOST_SUFFIXES = [
  "douyin.com",
  "iesdouyin.com",
  "snssdk.com",
  "amemv.com",
  "douyinvod.com",
  "douyinpic.com",
  "douyinstatic.com",
  "zjcdn.com",
  "bytecdn.cn",
  "byteimg.com",
  "ixigua.com",
  "365yg.com",
  "pstatp.com",
];

export function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith("." + s));
  } catch {
    return false;
  }
}

/** 从用户粘贴的整段分享文本里提取抖音链接 */
export function extractDouyinUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s，。！!？?"'<>]+/);
  if (!m || !isAllowedUrl(m[0])) return null;
  return m[0];
}

/** 前端展示用的统一结构 */
export interface ParsedItem {
  id: string;
  type: "video" | "images";
  title: string;
  author: { nickname: string; avatar?: string };
  cover?: string;
  video?: { url: string; width?: number; height?: number; duration?: number };
  images?: string[];
  music?: { title?: string; url?: string };
}

export class ParseError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}
