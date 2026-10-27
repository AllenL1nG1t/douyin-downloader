# 抖音无水印解析

网站（Next.js）和解析服务
[Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API)
打包成一套 Docker Compose，一条命令在本地或服务器上启动。

```
浏览器 ──► Caddy（HTTPS，可选） ──► web:3000 ──► api:8000（解析服务，仅内部网络） ──► 抖音
```

解析服务的源码以 git 子模块放在 `dtk/`，固定在一个已验证的版本上。

## 首次部署

需要 Docker（Windows / macOS 用 Docker Desktop，Linux 用 Docker Engine + Compose v2.24+），
建议 8G 以上内存（浏览器容器较吃内存）。

```bash
git clone --recurse-submodules <你的仓库地址>
cd <仓库目录>
```

**1. 解析服务的配置 `dtk/.env`**：按 `dtk/docker/README.md` 用随机值生成，再加一行
`DTK_BROWSER_RPC_URL=http://browser-rpc:9000`。**备份好其中的 `DTK_SECRET_KEY`**，
丢了或改了，已保存的 Cookie 就无法解密。

**2. 先只启动解析服务，完成初始化**

```bash
docker compose up -d api worker browser-rpc
docker compose logs api        # 找到 http://127.0.0.1:8000/setup?token=... 链接
```

打开链接，创建管理员、生成第一个抖音身份，然后在「API Key」页面创建一个只勾选
`douyin:read` 的 Key。（在服务器上，用 `ssh -L 8000:127.0.0.1:8000 用户@服务器` 在本地打开。）

**3. 网站的配置 `.env`**：

```bash
cp .env.example .env           # 填入 DTK_API_KEY
```

**4. 启动全部服务**

```bash
docker compose up -d --build
```

打开 http://localhost:3000 。

## 服务器上启用 HTTPS

1. 域名 A 记录指向服务器 IP，防火墙开放 80 / 443
2. `.env` 中设置 `DOMAIN=你的域名`、`COMPOSE_PROFILES=browser,https`
3. `docker compose up -d`

Caddy 会自动申请和续期证书。解析服务控制台始终只监听服务器本机的 127.0.0.1:8000，不对外开放。

## 日常操作

| 操作 | 命令 |
| --- | --- |
| 查看状态 | `docker compose ps` |
| 查看网站日志 | `docker compose logs -f web` |
| 更新网站代码后重建 | `docker compose up -d --build web` |
| 升级解析服务 | `git -C dtk pull && docker compose up -d --build`（先看它的更新说明） |
| 停止（保留数据） | `docker compose down` |

## 本地开发网站

解析服务用 Docker 跑着，网站用开发模式：

```bash
npm install
npm run dev      # 需要 .env.local：DTK_BASE_URL=http://127.0.0.1:8000 和 DTK_API_KEY
```

先停掉容器里的网站（`docker compose stop web`），避免两者抢 3000 端口。

## 结构

- `compose.yaml`：一体化部署，`include` 了 `dtk/docker/compose.yml`
- `Dockerfile`：网站镜像（Next.js standalone）
- `deploy/Caddyfile`：HTTPS 反向代理
- `lib/dtk.ts`：调用解析服务并转换数据
- `lib/douyin.ts`：链接提取、下载域名白名单
- `app/api/parse`、`app/api/download`：解析与代理下载接口
- `app/page.tsx`：页面

## 注意

- 网站对外开放后，任何人都能用它解析，消耗的是你的身份池；建议只给自己或小范围使用
- 仅供个人学习使用，视频版权归原作者所有
