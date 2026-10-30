"use client";

import { useRef, useState } from "react";

interface ParsedItem {
  id: string;
  type: "video" | "images";
  title: string;
  author: { nickname: string; avatar?: string };
  cover?: string;
  video?: { url: string; width?: number; height?: number; duration?: number; qualities?: VideoQuality[] };
  images?: string[];
  music?: { title?: string; url?: string };
  mix?: MixInfo;
}

interface MixInfo {
  id: string;
  name: string;
  count?: number;
}

interface ParsedMix extends MixInfo {
  items: ParsedItem[];
  truncated?: boolean;
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

/** 某一集要下载的文件：视频取最高画质，图集取全部图片 */
function episodeDownloads(item: ParsedItem, prefix: string): string[] {
  if (item.type === "video") {
    const url = item.video?.qualities?.[0]?.url ?? item.video?.url;
    return url ? [downloadHref(url, prefix, "mp4")] : [];
  }
  return (item.images ?? []).map((src, i) => downloadHref(src, `${prefix}_${i + 1}`, "jpg"));
}

// 文件名以「合集名_集数」开头，下载目录里按名字排序就是播放顺序
function episodePrefix(mix: ParsedMix, index: number) {
  const width = String(mix.items.length).length;
  return `${mix.name}_${String(index + 1).padStart(width, "0")}_${mix.items[index].title}`;
}

// 带 download 属性的同源链接：出错时只是这一个下载失败，不会把页面跳走
function triggerDownload(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 两次下载之间的间隔，太快浏览器会丢掉一部分
const BATCH_INTERVAL_MS = 1000;

export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [item, setItem] = useState<ParsedItem | null>(null);
  const [qualityIndex, setQualityIndex] = useState(0);
  const [mix, setMix] = useState<ParsedMix | null>(null);
  const [mixLoading, setMixLoading] = useState(false);
  const [mixError, setMixError] = useState("");
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const cancelRef = useRef(false);

  const qualities = item?.video?.qualities ?? [];
  const selected = qualities[qualityIndex];
  const videoUrl = selected?.url ?? item?.video?.url;

  function reset() {
    cancelRef.current = true;
    setItem(null);
    setMix(null);
    setMixError("");
    setBatch(null);
    setQualityIndex(0);
  }

  async function onParse(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setError("");
    reset();
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "解析失败");
      if (json.mix) setMix(json.mix);
      else setItem(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setLoading(false);
    }
  }

  async function onLoadMix(id: string) {
    if (mixLoading) return;
    setMixLoading(true);
    setMixError("");
    try {
      const res = await fetch(`/api/mix?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "获取合集失败");
      setMix(json.mix);
    } catch (err) {
      setMixError(err instanceof Error ? err.message : "获取合集失败");
    } finally {
      setMixLoading(false);
    }
  }

  async function onDownloadAll() {
    if (!mix || batch) return;
    const hrefs = mix.items.flatMap((it, i) => episodeDownloads(it, episodePrefix(mix, i)));
    cancelRef.current = false;
    setBatch({ done: 0, total: hrefs.length });
    for (let i = 0; i < hrefs.length; i++) {
      if (cancelRef.current) break;
      triggerDownload(hrefs[i]);
      setBatch({ done: i + 1, total: hrefs.length });
      if (i < hrefs.length - 1) await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));
    }
    setBatch(null);
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
          <button type="button" className="btn ghost" onClick={() => { setText(""); setError(""); reset(); }}>
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

          {item.mix && !mix && (
            <div className="mix-hint">
              <span>
                属于合集「{item.mix.name}」{item.mix.count ? ` · 共 ${item.mix.count} 集` : ""}
              </span>
              <button type="button" className="btn ghost" disabled={mixLoading} onClick={() => onLoadMix(item.mix!.id)}>
                {mixLoading ? "加载中…" : "查看整个合集"}
              </button>
            </div>
          )}
          {mixError && <p className="error">{mixError}</p>}
        </section>
      )}

      {mix && (
        <section className="card result">
          <div className="mix-head">
            <div>
              <div className="nickname">合集「{mix.name}」</div>
              <div className="sub">
                共 {mix.items.length} 集{mix.truncated ? `（只列出前 ${mix.items.length} 集）` : ""}
                {mix.items[0]?.author.nickname ? ` · @${mix.items[0].author.nickname}` : ""}
              </div>
            </div>
            {batch ? (
              <button type="button" className="btn ghost" onClick={() => { cancelRef.current = true; }}>
                停止（{batch.done}/{batch.total}）
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={onDownloadAll}>
                一键下载全部
              </button>
            )}
          </div>
          <p className="sub">视频取最高画质，图集下载全部图片。浏览器询问是否允许下载多个文件时，请选择允许。</p>

          <ol className="episodes">
            {mix.items.map((ep, i) => {
              const files = episodeDownloads(ep, episodePrefix(mix, i));
              return (
                <li key={ep.id} className="episode">
                  {ep.cover ? <img src={ep.cover} alt="" loading="lazy" /> : <div className="episode-thumb" />}
                  <div className="episode-info">
                    <div className="episode-title">
                      {i + 1}. {ep.title}
                    </div>
                    <div className="sub">
                      {ep.type === "video" ? `视频 ${formatDuration(ep.video?.duration)}` : `图集 · ${ep.images?.length} 张`}
                    </div>
                  </div>
                  {files.length === 1 ? (
                    <a className="btn ghost" href={files[0]} download>
                      下载
                    </a>
                  ) : (
                    <button type="button" className="btn ghost" onClick={() => files.forEach((f, j) => setTimeout(() => triggerDownload(f), j * BATCH_INTERVAL_MS))}>
                      下载
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <footer className="footer">
        本工具仅供个人学习与下载自己的作品使用。视频版权归原作者所有，请勿用于商业用途或二次传播。
      </footer>
    </main>
  );
}
