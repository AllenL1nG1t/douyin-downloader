# 抖音无水印解析

Next.js 15 (App Router) 前端，部署在 Vercel。解析由你自己部署的
[Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API) 完成，
本项目只负责页面和转发。

```
浏览器 ──► Vercel /api/parse ──► 你的 DTK 服务 POST /api/v1/parse ──► 抖音
浏览器 ──► Vercel /api/download ──► 抖音 CDN（代理下载，设置文件名）
```

## 1. 部署解析服务

按它的[快速开始文档](https://github.com/Evil0ctal/Douyin_TikTok_Download_API/blob/main/documents/zh/01-quickstart.md)用 Docker Compose 部署，然后：

1. 让它能从公网访问（Vercel 的函数要能连上），建议加 HTTPS（例如用 Caddy / Nginx 反代）
2. 在控制台「用户与 API 密钥」里新建一个 key，**只勾选 `douyin:read`**
3. 确认身份池里有可用的抖音身份，否则解析会失败

## 2. 本地运行

```bash
cp .env.example .env.local   # 填入 DTK_BASE_URL 和 DTK_API_KEY
npm install
npm run dev
```

## 3. 部署到 Vercel

1. 把项目推到 GitHub，在 Vercel 中 Import
2. 在 Project Settings → Environment Variables 添加 `DTK_BASE_URL`、`DTK_API_KEY`
3. 部署

API key 只在服务端使用，不会发到浏览器。

## 结构

- `lib/dtk.ts`：调用解析服务（`?wait=` 同步等待，超时则轮询 `/api/v1/tasks/{id}`），把返回的作品数据映射成前端结构，错误码转成中文提示
- `lib/douyin.ts`：链接提取、下载域名白名单
- `app/api/parse/route.ts`：`POST { text }` → 作品信息与无水印地址
- `app/api/download/route.ts`：代理下载（只允许抖音相关域名）
- `app/page.tsx`：前端页面

## 注意

- 代理下载的流量会计入 Vercel 带宽额度；大文件如果失败，可以用页面上的「打开原地址」按钮
- 仅供个人学习使用，视频版权归原作者所有
