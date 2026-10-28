"use client";

import { useState } from "react";

interface ParsedItem {
  id: string;
  type: "video" | "images";
  title: string;
  author: { nickname: string; avatar?: string };
  cover?: string;
  video?: { url: string; width?: number; height?: number; duration?: number; qualities?: VideoQuality[] };
  images?: string[];
  music?: { title?: string; url?: string };
}

interface VideoQuality {
  url: string;
  width?: number;
  height?: number;
  bitrate?: number;
  size?: number;
}

function qualityLabel(q: VideoQuality) {
  const p = Math.min(q.width ?? Infinity, q.height ?? Infinity);
  return Number.isFinite(p) ? `${p}p` : "原画";
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function downloadHref(url: string, name: string, ext: string) {
  const q = new URLSearchParams({ url, name, ext });
  return `/api/download?${q.toString()}`;
}

function formatDuration(ms?: number) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [item, setItem] = useState<ParsedItem | null>(null);
  const [qualityIndex, setQualityIndex] = useState(0);

  const qualities = item?.video?.qualities ?? [];
  const selected = qualities[qualityIndex];
  const videoUrl = selected?.url ?? item?.video?.url;

  async function onParse(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setError("");
    setItem(null);
    setQualityIndex(0);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "解析失败");
      setItem(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setLoading(false);
    }
  }

  async function onPaste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
    } catch {
      setError("无法读取剪贴板，请手动粘贴");
    }
  }

  return (
    <main className="container">
      <header className="hero">
        <h1>抖音无水印解析</h1>
        <p>粘贴抖音分享文本或链接，一键获取无水印视频、图集和背景音乐</p>
      </header>

      <form className="card form" onSubmit={onParse}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例如：7.43 复制打开抖音，看看【xxx的作品】… https://v.douyin.com/xxxxxx/"
          rows={4}
        />
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onPaste}>
            粘贴
          </button>
          <button type="button" className="btn ghost" onClick={() => { setText(""); setItem(null); setError(""); }}>
            清空
          </button>
          <button type="submit" className="btn primary" disabled={loading || !text.trim()}>
            {loading ? "解析中…" : "解析"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>

      {item && (
        <section className="card result">
          <div className="meta">
            {item.author.avatar && <img className="avatar" src={item.author.avatar} alt="" />}
            <div>
              <div className="nickname">@{item.author.nickname}</div>
              <div className="sub">
                {item.type === "video" ? `视频 ${formatDuration(item.video?.duration)}` : `图集 · ${item.images?.length} 张`}
              </div>
            </div>
          </div>
          <p className="title">{item.title}</p>

          {item.type === "video" && item.video && videoUrl && (
            <>
              <video className="player" src={videoUrl} poster={item.cover} controls playsInline preload="none" />
              {qualities.length > 1 && (
                <div className="qualities" role="radiogroup" aria-label="画质">
                  {qualities.map((q, i) => (
                    <button
                      key={q.url}
                      type="button"
                      role="radio"
                      aria-checked={i === qualityIndex}
                      className={`chip${i === qualityIndex ? " active" : ""}`}
                      onClick={() => setQualityIndex(i)}
                    >
                      {qualityLabel(q)}
                      {q.size ? <span className="chip-sub">{formatSize(q.size)}</span> : null}
                    </button>
                  ))}
                </div>
              )}
              <div className="actions">
                <a className="btn primary" href={downloadHref(videoUrl, selected ? `${item.title}_${qualityLabel(selected)}` : item.title, "mp4")}>
                  下载无水印视频{selected ? `（${qualityLabel(selected)}）` : ""}
                </a>
                <a className="btn ghost" href={videoUrl} target="_blank" rel="noreferrer">
                  打开原地址
                </a>
              </div>
            </>
          )}

          {item.type === "images" && item.images && (
            <div className="grid">
              {item.images.map((src, i) => (
                <a key={src} href={downloadHref(src, `${item.title}_${i + 1}`, "jpg")} title="点击下载">
                  <img src={src} alt={`图片 ${i + 1}`} loading="lazy" />
                </a>
              ))}
            </div>
          )}

          <div className="actions">
            {item.cover && (
              <a className="btn ghost" href={downloadHref(item.cover, `${item.title}_封面`, "jpg")}>
                下载封面
              </a>
            )}
            {item.music?.url && (
              <a className="btn ghost" href={downloadHref(item.music.url, item.music.title || `${item.title}_音乐`, "mp3")}>
                下载背景音乐
              </a>
            )}
          </div>
        </section>
      )}

      <footer className="footer">
        本工具仅供个人学习与下载自己的作品使用。视频版权归原作者所有，请勿用于商业用途或二次传播。
      </footer>
    </main>
  );
}
