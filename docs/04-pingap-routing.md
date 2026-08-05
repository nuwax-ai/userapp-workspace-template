# 反向代理与路由

这篇解释:外部请求怎么走到你的服务、`[proxy]` 怎么配、路由前缀怎么规划、以及 Pingap 的三种模式。

---

## 1. 一句话模型

你通过平台分配的**应用子域名**访问应用(如 `https://{应用标识}.<平台域名>`)。子域名背后的流量
打到应用容器内的反向代理 **Pingap**,它再根据你声明的 `[proxy]` 规则,把请求转发给容器里各个服务
(各自监听自己的 `$PORT`)。

```
浏览器  访问 https://{应用子域名}/api/go/health
   │
   ▼
平台入口(应用子域名) ──► 应用容器内的 Pingap ──► 按 path 前缀路由
                              ├──► /api/go/*   → backend-go   (127.0.0.1:PORT_go)
                              ├──► /api/java/* → backend-java (127.0.0.1:PORT_java)
                              ├──► /react/*    → frontend-react(127.0.0.1:PORT_react)
                              └──► /*          → userapp-next  (127.0.0.1:PORT_next)   ← catch-all
```

> 你**不用**管 Pingap 怎么装、怎么起——这些平台都做好了,它对用户不可见,只是子域名背后的路由引擎。
> 这篇后面讲到的 Pingap 细节,是给想深入了解路由规则的高级用户看的;日常你只管在 managed 模式下
> 声明每个 web 服务的 `[proxy].path`。

---

## 2. 三种模式(`[pingap].mode`)

在 `workspace.manifest.toml` 里选,默认 `managed`。

### `managed`(默认,绝大多数场景用这个)

平台根据每个 web 服务的 `[proxy]` **自动生成**全部路由(server / location / upstream)。你只需要
在每个要对外暴露的服务里填 `[proxy].path`。本模板所有服务都是 managed。

### `extend`(在 managed 基础上加插件/存储)

平台仍生成拓扑路由,你额外提供一个 `pingap/` 目录,**只能**定义 `plugins` 和 `storages`,服务通过
`[proxy].plugins` / `[proxy].upstream_includes` 引用。名称和平台生成的冲突会**直接失败**,不做字段级覆盖。

适用:你想加个限流/缓存/日志插件,但不想自己管整套路由。

```toml
# workspace.manifest.toml
[pingap]
mode = "extend"
config = "pingap/"          # 指向你的 pingap 配置目录(相对路径)
```

### `custom`(你完全自定义路由)

你提供完整的原生 Pingap TOML(单文件或多文件布局)。这时你**自己写路由**,服务地址用逻辑形式:

```toml
# 你的 pingap 配置里
[upstreams.go-backend]
addrs = ["rcoder://backend-go"]      # 用 rcoder://<service_id> 引用本 workspace 的服务
```

平台会把 `rcoder://backend-go` 解析成 `127.0.0.1:<该服务的锁定端口>`。引用不存在或
disabled 的服务会失败。

适用:你需要完全控制路由行为(复杂的重写、多 upstream、灰度等)。

---

## 3. `[proxy]` 字段语义(managed 模式核心)

managed 模式下,平台读每个 web 服务的 `[proxy]` 生成路由。

```toml
[proxy]
path = "/api/go/"
strip_prefix = true
plugins = []                 # managed 下留空
upstream_includes = []       # managed 下留空
```

### `path` —— 路由前缀

- **绝对 URL 路径**(以 `/` 开头),如 `/api/go/`、`/react`、`/`;
- **workspace 内必须唯一**(两个服务不能用同一个 path);
- **全 workspace最多一个 `/`**——这是 catch-all,匹配所有没被更具体前缀命中的请求,通常给"主前端"(如 Next.js 单体)。

### `strip_prefix` —— 是否剥掉前缀再转发

这是最容易混淆的字段,用一个例子说清楚:

假设 `backend-go` 声明 `path = "/api/go/"`,它有个 `GET /health` 接口:

| `strip_prefix` | 外部请求 | 后端 `backend-go` 实际收到的请求 |
|:---:|---|---|
| `true` | `GET /api/go/health` | `GET /health`(前缀被剥掉) |
| `false`(默认) | `GET /api/go/health` | `GET /api/go/health`(原样转发) |

**怎么选:**

- **API 后端**:通常 `strip_prefix = true`。后端代码按"挂在根路径"写(`/health`、`/users`),
  不用关心自己对外挂在哪个前缀下。
- **静态前端(SPA)**:通常 `strip_prefix = true`。前端按根路径打包,`/react` 前缀剥掉后,静态服务器
  从根提供文件。
- **全栈单体(catch-all `/`)**:`strip_prefix = false`(也是默认,可省略)。如 Next.js,它自己处理全部路由。

---

## 4. 路由规划

### 典型布局:前端 SPA + 多个后端 API

```
/                → 不用(或留给某个主前端)
/api/go/*        → backend-go      strip_prefix=true
/api/java/*      → backend-java    strip_prefix=true
/react/*         → frontend-react  strip_prefix=true
/vue/*           → frontend-vue    strip_prefix=true
```

每个后端一个独立前缀,前端各自一个路径。**不要**让两个服务抢同一个前缀。

### 典型布局:Next.js 单体(前后端一体)

```
/                → userapp-next    strip_prefix=false   ← 唯一的 catch-all
```

Next.js 自己处理页面路由 + API routes,所以整个站给它。

### ⚠️ catch-all `/` 的限制

- **全 workspace 只能有一个 `/`**。两个服务都写 `path = "/"` 会校验失败;
- 如果同时有 catch-all `/` 和具体前缀(如 `/react`),具体前缀优先命中(不会被 catch-all 吞掉)。
  但从语义上,catch-all 通常意味着"整站",建议和独立前端的 SPA 二选一,不要混用。

---

## 5. 本模板的路由分配(实例)

本模板 7 个服务都是 managed 模式,路由这么分:

| service_id | `path` | `strip_prefix` | 说明 |
|---|---|:---:|---|
| `backend-go` | `/api/go/` | true | Go 后端,后端收到 `/health` |
| `backend-java` | `/api/java/` | true | Java 后端 |
| `backend-python` | `/api/python/` | true | Python 后端 |
| `backend-rust` | `/api/rust/` | true | Rust 后端 |
| `frontend-react-vite` | `/react` | true | React SPA |
| `frontend-vue3-vite` | `/vue` | true | Vue3 SPA |
| `userapp-next` | `/` | false | Next.js 单体,唯一 catch-all |

> 这是一个**演示用的最复杂组合**。实际应用按需保留:要 Next.js 单体就删 SPA;要"SPA + 后端 API"
> 就删 Next.js,把 `/` 让给主前端。

---

## 6. 对外暴露 与 服务间调用

### 谁需要声明 `[proxy]`

- **对外提供 HTTP 的 web 服务**:声明 `[proxy].path`,平台在应用子域名下为它生成路由。
- **`kind = "worker"`**:后台任务,不监听 HTTP,**不能**声明 `[proxy]`(会校验失败)。
- **只想给同 workspace 内其他服务调用、不对外暴露的 web 服务**:省略 `[proxy]`——它仍会启动、监听
  端口、产日志,只是子域名下访问不到。

### 同一 workspace 内,服务之间怎么互调

一个 workspace 的所有 service 跑在**同一个应用容器**里,彼此是同容器进程。互调有两种方式:

- **走容器内反向代理(推荐)**:`http://127.0.0.1:9080/<被调服务的 proxy.path>/...`。Pingap 在容器内
  监听 `:9080`,同容器进程直接访问它即可。地址固定(端口 9080 + 路径前缀),不依赖平台分配的服务端口。
  这要求被调服务声明了 `[proxy]`。
- **直接连端口**:`http://127.0.0.1:<被调服务端口>/...`。但端口是平台按 `service_id` 确定性分配的、
  **不在环境变量里**(要自己读 `/app/code/release.lock.toml`),所以**不推荐**。

> ⚠️ `depends_on` 只控制**启动/迁移顺序**(被依赖的服务先起、先 migrate),**不是服务发现**——它不会
> 把对方地址或端口注入你的环境变量。
>
> 💡 **典型 SPA 场景**:前端用**相对路径**调后端(如 `fetch("/api/go/...")`),浏览器经应用子域名 →
> 反向代理 → 后端,前端完全不用知道后端端口。这是最常见的多服务互调方式,无需任何额外配置。

---

## 7. 平台护栏(你需要知道的边界)

平台对 Pingap 配置有硬性护栏,超出会失败:

- 统一入口只能是 `0.0.0.0:9080`,接受公网或内网来源;额外 listener 只能监听 loopback;
- 不要求公网域名或 HTTPS——需要 TLS 由外层平台终止;内网 IP / 内网域名 / HTTP 都是受支持的方式;
- Admin 始终关闭,运行时修改不作权威配置;
- 每类对象(server/location/upstream/plugin/certificate/storage)默认最多 256 个,总配置最多 2 MiB;
- 文件路径限制在 `/app/code`、`/app/data`、`/app/logs`、`/run/app-cli`;
- Pingap 二进制和配置必须锁到相同版本/commit(平台在 release.lock 里锁定)。

---

下一篇:[日志](05-logs.md)
