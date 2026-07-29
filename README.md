# userapp-workspace-template

UserApp **workspace 多项目**模板 —— 一个 `app_id` = 一个 workspace，下含 1 个或多个子项目。
平台（file-server）遍历各子项目打包、组装成一个整体包发布部署。本模板用 canonical
[`userapp-next-template`](../userapp-next-template)（Next.js + Drizzle）作为示例子项目。

> 完整设计见 rcoder 仓库 `docs/userapp-development-design.md`。

## 目录结构

```
userapp-workspace-template/              ← workspace 根（= app_id workspace）
├── workspace.manifest.toml              ← workspace 级（子项目列表 + [deploy] 部署配置）
├── start.sh                             ← workspace 级启动（自动发现子项目，单容器多服务）
├── scripts/lib/helpers.sh               ← 共享 helper（log / wait_for_pg）
└── userapp-next-template/               ← 子项目（canonical Next.js + Drizzle，原样不改）
    ├── project.manifest.toml            ← [project]type=node + [build]cmd/artifact
    ├── scripts/build-standalone.mjs     ← next build + esbuild migrate → userapp-next-standalone.zip
    └── src/ ...                         ← Next.js 源码
```

## 两级 manifest

| 层级 | 文件 | 职责 |
|---|---|---|
| workspace | `workspace.manifest.toml`（根） | 子项目列表（`[[projects]]` name+path+`proxy_path`）+ 部署配置（`[deploy]`：image/command/ports/env/resources） |
| project | `project.manifest.toml`（各子项目） | 项目类型（`type=node`）+ build 配置（`[build]` cmd+artifact） |

- file-server `POST /api/userapp/build` 读 workspace 级遍历子项目，读各 project 级跑 build。
- Java `create_app` 读 workspace 级 `[deploy]` 组装部署请求。

## pingap 统一反代（一个 URL 访问前后端）

容器内跑 **pingap**（基于 pingora 的反代，与 rcoder pingora-proxy 同引擎）作统一 HTTP 入口：
监听 **:3000**，按路径把请求分发到各子项目。用户只需访问 **`/proxy/apps/{id}/3000/`** 一个地址：
`/` → 前端、`/api/*` → 后端。

- **路由配置全自动**：`workspace.manifest.toml` 的 `[[projects]].proxy_path` 决定每个子项目经
  pingap 暴露的路径。file-server build 时据此生成 `pingap/pingap.toml` 打进包，start.sh 自动起
  pingap。**用户零手写反代配置**。
- **端口约定**：pingap = **:3000**（= `[deploy].ports` 的 app HTTP 端口，rcoder 透出）；各子项目 =
  **:4000+i**（内部，pingap 经 `127.0.0.1` 拨号，不对外；i = `[[projects]]` 顺序下标）。
- **proxy_path 用法**：
  - `"/"` = 兜底 catch-all（前端用，访问 `/` 命中它；pingap location 不写 path，权重最低）。
  - `"/api/"` = 前缀匹配（后端用，`/api/*` 转发）；配 `proxy_strip_prefix = true` 则转发前去
    `/api/` 前缀（后端收到 `/users` 而非 `/api/users`）。
  - 省略 `proxy_path` = 不经 pingap（仅内部服务，不对外）。
- **禁用 pingap**：所有子项目去掉 `proxy_path` → 不生成 pingap 配置 → start.sh 不起 pingap，
  子项目直连（向后兼容单项目）。

> 路由用社区标准（`/` → 前端 + `/api/` → 后端，NGINX+SPA/API 通用），应用在根路径。

### pingap 插件（默认开 + 可选）

**默认全开（零配置内置，纯收益）** —— 每个 location 自动带：
- `pingap:requestId`：请求 ID（`X-Request-Id`），便于 access_log 追踪 + 前端报错对账。
- `pingap:compressionUpstream`：gzip/br/zstd 压缩响应（前端 HTML + 后端 JSON 都受益）。

**可选（manifest 字段驱动生成 `[plugins]`）** —— `[[projects]]` 加字段：
- `proxy_cache = true`：响应缓存（内存 100mb，ttl 10m）。**前端静态资源用**；在 catch-all（`/`）上谨慎（会缓存 SSR HTML——Next.js 建议未来拆 `/_next/static/` 专属 location 做长缓存）。
- `proxy_rate_limit = 600`：IP 限流（每 60s 每 IP 最多 N 次）。**后端用**。

**认证类（参考 snippet，不进 manifest）** —— pingap.toml 是 build 时生成（覆盖手改），且密钥不该进 manifest。机器对机器保护 `/api/` 的 snippet（后续接运行时配置机制）：

```toml
# key_auth：API Key（header 校验）
[plugins.apiKey]
category = "key_auth"
header = "X-API-Key"
keys = ["<long-random-secret>"]   # 密钥，不放 manifest
hide_credentials = true

# jwt：已有 IdP（Auth0/Keycloak），远程 JWKS，本地不存密钥
[plugins.jwtAuth]
category = "jwt"
header = "Authorization"
jwks_url = "https://<tenant>.auth0.com/.well-known/jwks.json"
```

> 浏览器 SPA（cookie session）场景由后端自鉴权更合适，pingap 层不必加 auth。
> 前端+后端同源（都过 :3000）**不需要 CORS**。

## 加 / 减子项目（1 个或多个都行）

加后端只需 3 步：

1. 子项目目录放 workspace 根下（如 `userapp-backend/`），内含 `project.manifest.toml`。
2. `workspace.manifest.toml` 加一条 `[[projects]]`：
   ```toml
   [[projects]]
   name = "backend"
   path = "userapp-backend"
   proxy_path = "/api/"            # pingap 路由：/api/* 转后端
   proxy_strip_prefix = true       # 转发去 /api/ 前缀
   ```
3. 子项目 build 产物 zip 根需是 `server.js`（node standalone）。

file-server build 时按 `[[projects]]` 顺序自动分配内部端口 4000+i、生成 `pingap/pingap.toml`
（路由）+ `.service-ports`（启动清单）打进包。**start.sh 与 `[deploy].ports` 零手改**（pingap
统一占 :3000，新加子项目自动在 4000+i 接上）。

## 本地构建（验证子项目产物）

```sh
cd userapp-next-template
npm install
npm run build:standalone      # → userapp-next-standalone.zip（zip 根 = server.js）
```

## 打包 / 发布流程（file-server + Java 串）

```
file-server POST /api/userapp/build {appId}
  → resolve_project(appId) 读 workspace.manifest → 遍历子项目各跑 build_generic
  → 组装整体包 workspace-package.zip：
      userapp-next-template/   ← userapp-next-standalone.zip 内容（加前缀）
      start.sh                 ← workspace 根拷入
      scripts/lib/helpers.sh
      pingap/pingap.toml       ← 由 [[projects]].proxy_path 生成（统一反代配置）
      .service-ports           ← 各子项目内部端口清单（供 start.sh 启动）
  → 返 1 个 artifact {path: "workspace-package.zip"}

Java GET /api/userapp/static/{appId}/workspace-package.zip → 取整体包
Java upload（Java 存储）→ 1 个 url
Java app_manager upload_from_url（解压到 code/）+ create_app（[deploy]）
  → app-runtime（统一多语言）+ start.sh（自动起子项目 + 内置 PG/pgweb）
```

## 容器内运行（单容器多服务）

- 镜像：`app-runtime`（统一多语言，rust:1.97/Debian bookworm 底，内置 PG / pgweb / ttyd + Node/Python/Java/Go/Rust；supervisor 管 PG/pgweb/ttyd）
- ENTRYPOINT `start-app.sh` 把 `command`（`["bash","/app/code/start.sh"]`）包成 supervisor `[program:app]`（autorestart=true）
- start.sh：`wait_for_pg` → 读 `.service-ports` 启动子项目（:4000+i）→ 起 pingap（:3000）→ `wait -n` 阻塞；任一退出 → supervisor 整组重启
- 端口：pingap :3000（统一入口，`[deploy].ports` app）+ pgweb :8081；子项目 :4000+i 内部（不对外）

## 扩展（后续）

- 非_node 子项目（python/java/rust）：start.sh 的 `*/server.js` 发现约定需扩展（或子项目自带启动入口）；file-server build_generic 透明执行各 `[build].cmd`。
- 独立重启：当前一个服务崩 → 整组重启（粗粒度）；后续可拆多 supervisor `[program]`（见设计文档 §10）。
