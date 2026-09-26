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
- **静态前端(SPA)的 prod**：`base = "/react/"`、`strip_prefix = true`。浏览器请求 `/react/assets/x.js`，代理剥前缀后读取 `dist/assets/x.js`。
- **Vite devrun**：base 同样为 `/react/`，另配 `dev_strip_prefix = false`，让 Vite 收到并处理 `/react/...`。不能把 dev base 改成 `/`，否则 HTML 引用的 `/@vite/client`、`/src/...` 会绕过本服务路由。Vue 同理使用 `/vue/`。
- **全栈单体(catch-all `/`)**:`strip_prefix = false`(也是默认,可省略)。如 Next.js,它自己处理全部路由。

---

`dev_strip_prefix` 从 app-cli 0.3.7 起支持，仅在 dev 模式且服务有 `[devrun]` 时生效；省略则沿用 `strip_prefix`，其他服务不受影响。managed/extend 均支持，custom 需自行维护路由。

**为什么保留可选覆盖？** 开发时请求交给带 base 的 Vite，生产时请求交给以 `dist` 为根的静态托管，
二者接收路径的约定不同。仅统一成 `true` 会剥掉 Vite 需要的前缀，统一成 `false` 则会查找
`dist/react/assets/...` 而不是 `dist/assets/...`。要统一需另行实现静态服务的子路径挂载，
不能只删除字段或根据命令名猜测开发服务器。dev/prod 约定一致的服务仍只配置 `strip_prefix`；
React/Vue 由模板固定生成这两个值，日常只需修改 `path`。

```toml
[proxy]
path = "/react"
strip_prefix = true
dev_strip_prefix = false
```

先升级平台 file-server 与 app-cli，再使用新字段；旧版严格解析会拒绝它。模板升级不会改写存量项目，迁移方式见下节。`app-cli gen-lock --workspace . --dev` 预览 dev 路由，省略 `--dev` 预览 prod 路由。验收必须检查 JS Content-Type 和 HMR，不能只看首页 200 或任务 completed。

模板开发中间件同时响应内部 `/health` 和带前缀的 `/react/health`（Vue 同理）。当代理把无尾斜杠入口转发给 Vite 时，中间件将 GET/HEAD 跳转到带尾斜杠入口并保留查询参数；若 manifest 的 path 本身带尾斜杠，代理未必会转发裸入口。因此工作区首页卡片始终使用带尾斜杠链接。

## 4. 路由规划

### React/Vue：TOML 是公共路径的唯一来源

模板的 `vite.config.ts` 调用 `scripts/manifest-routing.mjs`，用 TOML 解析器读取**该子项目**的
`project.manifest.toml`。`proxy.path = "/admin"` 或 `"/admin/"` 都得到 `base = "/admin/"`；
`path = "/"` 得到 `base = "/"`。读取位置相对配置文件，不依赖执行命令时的当前目录。
文件缺失、TOML 无法解析或路径非法时，dev/build 直接报错，不回退到 `/`。

**改模块公共路径只改 TOML**，不改 Vite base、不加 `--base` 覆盖，也不新增环境变量保存第二份路由。
这同时适用于平台启动和直接运行 `pnpm dev` / `pnpm build`。改完后重启 dev 服务，让平台重新生成路由；
prod 需要重新构建并发布，已产出的 `dist` 不会随 TOML 自动改变。导航卡片、跨模块业务链接也需更新。
已有 Vite 进程不承诺热更新 manifest。

同一个应用域名下可以放两个 Vue 模块，CLI 为它们创建独立目录与 manifest：

```bash
# 在空 workspace 初始化第一个前端
template-cli init . --frontend vue --service-id admin-web --path /admin/
# 在 workspace 根追加同一种模板
template-cli add frontend-vue3-vite --service-id portal-web --path /portal/
```

| 服务 | TOML 路径 | 应用域名下的入口 |
|---|---|---|
| `admin-web` | `/admin/` | `/admin/` |
| `portal-web` | `/portal/` | `/portal/` |

不要复制整个子项目来创建新服务；`service_id` 和路径必须分别唯一。CLI 按 TOML section 读取已有服务，
支持单引号、缩进等合法写法，并拒绝 `/admin` 与 `/admin/` 的重复分配。
React/Vue 模板的 `strip_prefix = true`、`dev_strip_prefix = false` 已由 CLI 生成，通常保持不变。
业务代码引用本模块的公共资源可用 `import.meta.env.BASE_URL`；共享后端仍使用它自己的 `/api/...` 路由。
模板默认使用 hash router，增加同类模块不需要修改 router；主动切换 history router 时再适配该框架的 base。

**存量项目升级**：增加 `smol-toml` 开发依赖并同步本模板的 `scripts/manifest-routing.mjs`；
在 Vite 配置中导入 `readManifestBase`，将 base 改为
`readManifestBase(new URL('./project.manifest.toml', import.meta.url))`，保留原有业务插件。
同时合入模板的 health/无尾斜杠跳转插件、`tsconfig.node.json` 的 helper 引用和 manifest 的 dev/prod 配对。
旧项目仍写死 base 时，单独改 TOML 不会自动修复。

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
| `frontend-react-vite` | `/react` | true | React SPA(`type = "static"`,平台内置静态托管) |
| `frontend-vue3-vite` | `/vue` | true | Vue3 SPA(`type = "static"`,平台内置静态托管) |
| `userapp-next` | `/` | false | Next.js 单体,唯一 catch-all |

> 这是一个**演示用的最复杂组合**。实际应用按需保留:要 Next.js 单体就删 SPA;要"SPA + 后端 API"
> 就删 Next.js,把 `/` 让给主前端。

---

## 6. 对外暴露 与 服务间调用

### 谁需要声明 `[proxy]`

- **对外提供 HTTP 的 web 服务**:声明 `[proxy].path`,平台在应用子域名下为它生成路由。
- **`kind = "worker"`**:后台服务,**不能**声明 `[proxy]`(会校验失败),但可以有内部 HTTP 健康接口。当前模板必须保留该接口及 `$PORT` 监听,不能把“无公开路由”理解成“无监听”。
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
