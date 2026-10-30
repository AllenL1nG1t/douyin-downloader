import { NextRequest, NextResponse } from "next/server";
import { isValidMixId, ParseError } from "@/lib/douyin";
import { fetchMixWithDtk } from "@/lib/dtk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 按 mix_id 取整个合集：单个作品解析出所属合集后，前端用它加载全部集数
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isValidMixId(id)) {
    return NextResponse.json({ error: "合集 ID 不正确" }, { status: 400 });
  }

  try {
    return NextResponse.json({ mix: await fetchMixWithDtk(id) });
  } catch (e) {
    if (e instanceof ParseError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ error: "获取合集失败，请稍后重试" }, { status: 500 });
  }
}
