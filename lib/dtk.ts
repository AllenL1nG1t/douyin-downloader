// 调用自部署的 Douyin_TikTok_Download_API（v1 REST API）
// 文档：https://github.com/Evil0ctal/Douyin_TikTok_Download_API/blob/main/documents/zh/11-api.md

import { isValidMixId, ParseError, type MixInfo, type ParsedItem, type ParsedMix, type VideoQuality } from "./douyin";

// 单次 ?wait= 的秒数，不能超过服务端 api.max_wait_seconds（默认 30）
const WAIT_SECONDS = 25;
// 整个解析流程的总时限，要小于路由的 maxDuration
const TOTAL_TIMEOUT_MS = 50_000;

interface Envelope<T = any> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; retry_after?: number } | null;
}

// 只把用户能理解的错误原样透出，其余统一提示
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_URL: "无法识别的链接，请粘贴抖音分享链接",
  UNSUPPORTED_CONTENT: "暂不支持这种类型的作品",
  NOT_FOUND: "作品不存在或已删除",
  CONTENT_PRIVATE: "作品为私密作品，无法解析",
  RATE_LIMITED: "请求太频繁，请稍后再试",
  QUEUE_FULL: "解析服务繁忙，请稍后再试",
  IDENTITY_POOL_EXHAUSTED: "解析服务暂时没有可用身份，请稍后再试",
  UPSTREAM_RISK_CONTROL: "抖音触发了风控，请稍后再试",
  UPSTREAM_UNREACHABLE: "解析服务连不上抖音，请稍后再试",
  UNAUTHENTICATED: "解析服务认证失败，请检查 DTK_API_KEY",
  FORBIDDEN_SCOPE: "解析服务的 API Key 缺少 douyin:read 权限",
};

function config() {
  const base = process.env.DTK_BASE_URL?.replace(/\/+$/, "");
  const key = process.env.DTK_API_KEY;
  if (!base || !key) {
    throw new ParseError("服务端未配置 DTK_BASE_URL / DTK_API_KEY", 500);
  }
  return { base, key };
}

async function call(path: string, init: RequestInit = {}) {
  const { base, key } = config();
  const sep = path.includes("?") ? "&" : "?";
  let res: Response;
  try {
    res = await fetch(`${base}${path}${sep}lang=zh`, {
      ...init,
      headers: {
        "X-API-Key": key,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout((WAIT_SECONDS + 5) * 1000),
    });
  } catch {
    throw new ParseError("无法连接解析服务，请稍后重试", 502);
  }
  let body: Envelope;
  try {
    body = await res.json();
  } catch {
    throw new ParseError(`解析服务返回异常（HTTP ${res.status}）`, 502);
  }
  return { status: res.status, body };
}

function toError(err: { code: string; message: string } | null | undefined): ParseError {
  if (!err) return new ParseError("解析失败，请稍后重试");
  const known = ERROR_MESSAGES[err.code];
  if (!known) console.error("dtk error", err.code, err.message);
  return new ParseError(known ?? err.message ?? "解析失败，请稍后重试", err.code === "RATE_LIMITED" ? 429 : 422);
}

/** 提交任务并等到出结果，返回任务的结果数据（作品、分页等） */
async function runTask(path: string, init: RequestInit = {}): Promise<any> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  const sep = path.includes("?") ? "&" : "?";
  const { status, body } = await call(`${path}${sep}wait=${WAIT_SECONDS}`, init);
  if (!body.success) throw toError(body.error);

  // 202：时限内还没完成，任务仍在跑，用 task_id 继续轮询
  if (status === 202) {
    const taskId = body.data?.task_id as string | undefined;
    if (!taskId) throw new ParseError("解析服务返回异常", 502);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const task = await call(`/api/v1/tasks/${encodeURIComponent(taskId)}`);
      if (!task.body.success) throw toError(task.body.error);
      const state = task.body.data?.state;
      if (state === "done") return task.body.data.data;
      if (state === "failed") throw toError(task.body.data.error);
    }
    throw new ParseError("解析超时，请稍后重试", 504);
  }

  // ?wait= 等到结果时，data 就是结果本身；兼容万一返回的是任务载荷
  const data = body.data;
  if (data?.state === "done" && data?.data) return data.data;
  if (data?.state === "failed") throw toError(data.error);
  return data;
}

function firstUrl(img: any): string | undefined {
  return img?.url || img?.urls?.[0] || undefined;
}

/**
 * media.streams 是同一视频的多路转码（分辨率 × 码率 × 编码）。
 * 每个分辨率只留码率最高的一路，按清晰度从高到低排，作为可选画质。
 */
function toQualities(streams: any[] | undefined): VideoQuality[] {
  const best = new Map<number, VideoQuality>();
  for (const s of streams ?? []) {
    const url = s?.url || s?.urls?.[0];
    if (!url || s.watermark) continue;
    const q: VideoQuality = {
      url,
      width: s.width ?? undefined,
      height: s.height ?? undefined,
      bitrate: s.bitrate ?? undefined,
      size: s.size_bytes ?? undefined,
    };
    // 横屏视频 height 才是常说的 1080p，竖屏则是 width，取短边
    const key = Math.min(q.width ?? Infinity, q.height ?? Infinity);
    const prev = best.get(key);
    if (!prev || (q.bitrate ?? 0) > (prev.bitrate ?? 0)) best.set(key, q);
  }
  return [...best.entries()].sort((a, b) => b[0] - a[0]).map(([, q]) => q);
}

/** 把服务返回的 Content 映射成前端使用的结构 */
export function toParsedItem(c: any): ParsedItem {
  if (!c?.content_id) throw new ParseError("解析服务返回的数据不完整", 502);
  if (c.platform && c.platform !== "douyin") throw new ParseError("目前只支持抖音链接");
  if (c.is_deleted) throw new ParseError("作品已删除");
  if (c.is_private) throw new ParseError("作品为私密作品，无法解析");

  const media = c.media ?? {};
  const images: string[] = (media.images ?? []).map(firstUrl).filter(Boolean);
  const isAlbum = c.kind === "image_album" || (!media.video && images.length > 0);

  const item: ParsedItem = {
    id: String(c.content_id),
    type: isAlbum ? "images" : "video",
    title: c.title || c.description || `douyin_${c.content_id}`,
    author: {
      nickname: c.author?.nickname ?? "",
      avatar: firstUrl(c.author?.avatar),
    },
    cover: firstUrl(media.covers?.[media.covers.length - 1]) ?? firstUrl(media.covers?.[0]),
    music: c.music?.play_url ? { title: c.music.title ?? undefined, url: c.music.play_url } : undefined,
  };

  if (isAlbum) {
    if (!images.length) throw new ParseError("没有找到图集图片");
    item.images = images;
  } else {
    const v = media.video;
    const url = v?.url || v?.urls?.[0];
    if (!url) throw new ParseError("没有找到视频地址");
    item.video = {
      url,
      width: v.width ?? undefined,
      height: v.height ?? undefined,
      duration: c.duration_ms ?? undefined,
      qualities: toQualities(media.streams),
    };
  }
  return item;
}

/** 抖音原始数据里的 mix_info：作品属于哪个合集 */
function toMixInfo(raw: any): MixInfo | undefined {
  const m = raw?.mix_info;
  const id = m?.mix_id != null ? String(m.mix_id) : "";
  if (!isValidMixId(id)) return undefined;
  return {
    id,
    name: m.mix_name || "合集",
    count: m.statis?.updated_to_episode ?? undefined,
  };
}

export async function parseWithDtk(url: string): Promise<ParsedItem> {
  // 要 raw 只是为了读 mix_info，读完就丢掉，不返回给前端
  const c = await runTask("/api/v1/parse", {
    method: "POST",
    body: JSON.stringify({ url, include_raw: true }),
  });
  const item = toParsedItem(c);
  item.mix = toMixInfo(c?.raw);
  return item;
}

// 抖音单页最多 50 条；合集再长也只取前 MIX_MAX_ITEMS 条，避免一次请求跑太久
const MIX_PAGE_SIZE = 50;
const MIX_MAX_ITEMS = 500;

/** 翻完整个合集。第一页带 raw 用来拿合集名称，后面的页不带 */
export async function fetchMixWithDtk(mixId: string): Promise<ParsedMix> {
  const items: ParsedItem[] = [];
  const seen = new Set<string>();
  let info: MixInfo | undefined;
  let cursor: string | undefined;
  let truncated = false;

  for (;;) {
    const q = new URLSearchParams({ mix_id: mixId, count: String(MIX_PAGE_SIZE) });
    if (cursor) q.set("cursor", cursor);
    if (!info) q.set("include_raw", "true");
    const page = await runTask(`/api/v1/douyin/mix/posts?${q.toString()}`);

    for (const c of page?.items ?? []) {
      info ??= toMixInfo(c?.raw);
      try {
        const item = toParsedItem(c);
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      } catch {
        // 删除、私密或缺媒体的那一集跳过，不影响其余
      }
    }

    if (!page?.has_more || !page?.cursor || page.cursor === cursor) break;
    if (items.length >= MIX_MAX_ITEMS) {
      truncated = true;
      break;
    }
    cursor = page.cursor;
  }

  if (!items.length) throw new ParseError("合集里没有可下载的作品", 404);
  return {
    id: mixId,
    name: info?.name ?? "合集",
    count: info?.count,
    items: items.slice(0, MIX_MAX_ITEMS),
    truncated: truncated || items.length > MIX_MAX_ITEMS || undefined,
  };
}
