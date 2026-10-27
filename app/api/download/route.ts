import { NextRequest } from "next/server";
import { isAllowedUrl, MOBILE_UA } from "@/lib/douyin";

export const runtime = "nodejs";
export const preferredRegion = ["hkg1"];
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 以源站实际返回的类型为准，比如封面常常是 webp 而不是 jpg
const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n#]+/g, " ").trim().slice(0, 80) || "douyin";
}

// 代理下载：带上移动端 UA 请求抖音 CDN，把文件流转发给浏览器并设置下载文件名
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const name = req.nextUrl.searchParams.get("name") ?? "douyin";
  const requestedExt = (req.nextUrl.searchParams.get("ext") ?? "mp4").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "mp4";

  if (!isAllowedUrl(url)) {
    return new Response("不允许的下载地址", { status: 400 });
  }

  const upstream = await fetch(url, {
    headers: { "User-Agent": MOBILE_UA, Referer: "https://www.douyin.com/" },
    redirect: "follow",
  });

  // 跳转后的最终地址也必须在白名单内
  if (!isAllowedUrl(upstream.url)) {
    return new Response("不允许的下载地址", { status: 400 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(`源站返回错误（HTTP ${upstream.status}）`, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const ext = EXT_BY_TYPE[contentType.split(";")[0].trim().toLowerCase()] ?? requestedExt;
  const filename = `${safeFilename(name)}.${ext}`;
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="douyin.${ext}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store",
  });
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);

  return new Response(upstream.body, { status: 200, headers });
}
