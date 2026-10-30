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

const MIX_ID_PATTERNS = [/\/collection\/(\d{1,32})/, /\/mix\/(?:detail\/)?(\d{1,32})/, /[?&]mix_id=(\d{1,32})/];

/** 合集页链接（douyin.com/collection/…、分享页 share/mix/detail/…）里的 mix_id */
export function mixIdFromUrl(url: string): string | null {
  for (const re of MIX_ID_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function isValidMixId(id: string): boolean {
  return /^\d{1,32}$/.test(id);
}

/**
 * 短链接要跟着跳转才知道指向的是作品还是合集。只跟白名单内的跳转，
 * 拿不到就返回 null，交给解析服务按普通作品处理。
 */
export async function resolveMixId(url: string): Promise<string | null> {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const id = mixIdFromUrl(current);
    if (id) return id;
    let res: Response;
    try {
      res = await fetch(current, {
        headers: { "User-Agent": MOBILE_UA },
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return null;
    current = new URL(location, current).toString();
    if (!isAllowedUrl(current)) return null;
  }
  return mixIdFromUrl(current);
}

/** 一个可选画质：同一分辨率只保留码率最高的那路 */
export interface VideoQuality {
  url: string;
  width?: number;
  height?: number;
  bitrate?: number;
  size?: number;
}

/** 前端展示用的统一结构 */
export interface ParsedItem {
  id: string;
  type: "video" | "images";
  title: string;
  author: { nickname: string; avatar?: string };
  cover?: string;
  video?: { url: string; width?: number; height?: number; duration?: number; qualities?: VideoQuality[] };
  images?: string[];
  music?: { title?: string; url?: string };
  /** 作品所属的合集，没有则不带 */
  mix?: MixInfo;
}

export interface MixInfo {
  id: string;
  name: string;
  count?: number;
}

/** 整个合集：按集数顺序排好的作品 */
export interface ParsedMix extends MixInfo {
  items: ParsedItem[];
  /** 条数超过上限被截断时为 true */
  truncated?: boolean;
}

export class ParseError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}
