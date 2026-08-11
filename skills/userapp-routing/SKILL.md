---
name: userapp-routing
description: >
  UserApp workspace 的反向代理与路由规则。当用户需要规划路由前缀、配置 [proxy]、
  理解 strip_prefix、处理多服务路由、或选择 Pingap 模式时使用。
  覆盖:managed/extend/custom 三种模式、proxy.path 规划、strip_prefix 语义、
  catch-all / 限制、服务间互调方式。
  触发词:路由、proxy、strip_prefix、反向代理、pingap、路径前缀、catch-all、
  前端调后端、服务间调用、404、502。
---

# UserApp 反向代理与路由

## 流量模型

```
浏览器  访问 https://{应用子域名}/api/go/health
   │
   ▼
平台入口(应用子域名) ──► 容器内 Pingap ──► 按 path 前缀路由
                              ├──► /api/go/*   → backend-go   (127.0.0.1:PORT_go)
                              ├──► /api/java/* → backend-java
                              ├──► /react/*    → frontend-react
                              └──► /*          → userapp-next  ← catch-all
```

## 三种 Pingap 模式(`[pingap].mode`)

| 模式 | 谁配路由 | 适用 | 你要做什么 |
|---|---|---|---|
| `managed`(默认) | **平台自动**按各服务 `[proxy]` 生成 | 绝大多数场景 | 填 `[proxy].path` 即可 |
| `extend` | 平台 + 你的补充(插件/存储) | 加限流/缓存插件 | 提供 `pingap/` 目录(只允许 plugins/storages) |
| `custom` | **你完全自定义** | 完全控制路由 | 放原生 Pingap TOML,地址写 `rcoder://<service_id>` |

## [proxy] 字段(managed 模式核心)

```toml
[proxy]
path = "/api/go/"
strip_prefix = true       # true=转发前剥掉前缀;false=原样转发
plugins = []              # managed 下留空
upstream_includes = []    # managed 下留空
```

### strip_prefix 用一个例子说清楚

假设 `backend-go` 声明 `path = "/api/go/"`,它有 `GET /health`:

| strip_prefix | 外部请求 | 后端实际收到 |
|:---:|---|---|
| `true` | `GET /api/go/health` | `GET /health`(前缀被剥) |
| `false`(默认) | `GET /api/go/health` | `GET /api/go/health`(原样) |

**怎么选:**
- **API 后端**:`strip_prefix = true`(后端按根路径写,不关心对外前缀)
- **静态前端 SPA**:`strip_prefix = true`(前端按根路径打包)
- **全栈单体 catch-all `/`**:`strip_prefix = false`(如 Next.js,自己处理全部路由)

## 路由规划

### 典型布局:前端 SPA + 多个后端 API

```
/api/go/*     → backend-go      strip_prefix=true
/api/java/*   → backend-java    strip_prefix=true
/react/*      → frontend-react  strip_prefix=true
/vue/*        → frontend-vue    strip_prefix=true
```

每个后端独立前缀,前端各自路径。**不要**让两个服务抢同一个前缀。

### 典型布局:Next.js 单体

```
/             → userapp-next    strip_prefix=false   ← 唯一 catch-all
```

Next.js 自己处理页面路由 + API routes,整站给它。

### catch-all `/` 的限制

- **全 workspace 只能有一个 `/`**
- 具体前缀(如 `/react`)优先命中,不会被 catch-all 吞掉
- 但 catch-all 通常意味着"整站",建议和独立前端 SPA **二选一**

## 谁需要声明 [proxy]

- **对外提供 HTTP 的 web 服务** → 声明 `[proxy].path`
- **`kind = "worker"`** → **不能**声明 `[proxy]`(校验失败)
- **只给同 workspace 内调用的 web 服务** → 省略 `[proxy]`(仍启动/监听/产日志,但子域名访问不到)

## 同一 workspace 内服务互调

所有 service 跑在**同一容器**,互调有两种方式:

### 走容器内反向代理(推荐)

```typescript
// 前端用相对路径调后端,浏览器经子域名 → 反代 → 后端
fetch('/api/go/items')
```

地址固定 `http://127.0.0.1:9080/<被调服务的 proxy.path>/...`,不依赖平台分配端口。

### 直接连端口(不推荐)

`http://127.0.0.1:<端口>/...`,但端口不在环境变量里(要读 release.lock.toml)。

> `depends_on` 只控制**启动顺序**,不是服务发现——它不会注入对方地址/端口。

## 平台护栏

- 统一入口 `0.0.0.0:9080`,接受公网或内网来源
- 不要求公网域名或 HTTPS(TLS 由平台终止);内网 IP/域名/HTTP 都支持
- Admin 始终关闭
- 每类对象(server/location/upstream/plugin/certificate/storage)最多 256 个,总配置最多 2 MiB
- 文件路径限制在 `/app/code`、`/app/data`、`/app/logs`、`/run/app-cli`
