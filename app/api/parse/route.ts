import { NextRequest, NextResponse } from "next/server";
import { extractDouyinUrl, ParseError } from "@/lib/douyin";
import { parseWithDtk } from "@/lib/dtk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text : "";
  } catch {
    // ignore
  }
  if (!text.trim()) {
    return NextResponse.json({ error: "请粘贴抖音分享链接" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "输入内容过长" }, { status: 400 });
  }

  const url = extractDouyinUrl(text);
  if (!url) {
    return NextResponse.json({ error: "没有找到抖音链接，请粘贴抖音分享文本或链接" }, { status: 400 });
  }

  try {
    const data = await parseWithDtk(url);
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof ParseError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ error: "解析失败，请稍后重试" }, { status: 500 });
  }
}
