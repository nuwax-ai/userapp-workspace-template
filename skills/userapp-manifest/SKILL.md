---
name: userapp-manifest
description: >
  UserApp workspace 的 manifest 配置权威参考。当用户需要编写或修改
  workspace.manifest.toml 或 project.manifest.toml 时使用。
  覆盖:核心概念(app_id/workspace/service)、全部字段(类型/必填/默认值)、
  校验规则(Fail-Fast 清单)、环境变量约定、数据库连接。
  触发词:写 manifest、改配置、project.manifest、workspace.manifest、
  service_id、proxy path、env、环境变量、数据库连接、校验报错。
---

# UserApp Manifest 配置参考

## 三个核心概念

| 概念 | 是什么 | 例子 |
|---|---|---|
| **app_id** | 平台里一个应用的稳定 ID,对应**一个 workspace** 和一套持久存储 | `app-e2e-go` |
| **workspace** | 你一次提交的**全部源码集合**,根目录一个 `workspace.manifest.toml` + 若干子项目。**构建/发布/回滚的原子单位** | 整个仓库根目录 |
| **service** | workspace 里一个可独立构建、启动、产日志的子项目。每个有自己的 `project.manifest.toml` | `backend-go/`、`frontend-react/` |

```
app_id = my-app
 │
 └─ workspace(根目录)
     ├── workspace.manifest.toml        ← workspace 级声明
     ├── backend-go/                    ┐
     │   └── project.manifest.toml      │
     ├── backend-java/                  ├─ 每个 = 一个 service
     │   └── project.manifest.toml      │
     └── frontend-react/                ┘
         └── project.manifest.toml
```

## 六条铁律

1. **两级 Manifest** — 根目录一个 `workspace.manifest.toml`,每个一级子目录一个 `project.manifest.toml`。平台**只认**这两个确切文件名。
2. **严格校验,Fail Fast** — 未知字段、非法枚举、重复路由、依赖环 → 构建立即失败并报清楚原因。每个 section 都是 `deny_unknown_fields`。
3. **端口由平台定** — 服务必须监听 `0.0.0.0:$PORT`,`PORT` 是构建时确定的(4000–7999)。**硬编码端口 = 必错**。
4. **镜像/资源/端口由平台管** — 不在 TOML 里配。
5. **service_id 是稳定身份** — 不是目录名。决定日志目录、路由 upstream、依赖引用。一旦上线别随便改。
6. **命令是 argv,不走 shell** — 需 shell 功能要显式 `["sh","-c","..."]`。

## workspace.manifest.toml

```toml
schema_version = 1                  # 必填,当前 = 1

[workspace]
name = "my-app"                     # 必填,非空
description = "一句话描述"            # 可选

[pingap]
mode = "managed"                    # 可选,默认 managed。managed / extend / custom
# config = "pingap/"                # 仅 extend/custom;managed 下禁止

[health]
bridge_service = "api"              # 可选:把 workspace 的 /ready 桥接到该后端深检查
```

## project.manifest.toml

```toml
schema_version = 1

[project]
service_id = "api"                  # 必填,DNS-1123(小写/数字/-,1-63字符),workspace内唯一
name = "My API"                     # 必填,人类可读
type = "go"                         # 必填:node/java/python/go/rust/static
kind = "web"                        # 可选,默认 web。web/worker(worker不能声明[proxy])
enabled = true                      # 可选,默认 true

[build]
command = ["sh", "scripts/build.sh"]  # 必填,argv数组,直接执行不走shell
artifact = "artifact.zip"           # 必填,构建产物相对路径(不能绝对/含..)

[run]
command = ["./server"]              # 必填,服务必须监听 0.0.0.0:$PORT
migrate = ["./migrate"]             # 可选,启动前按拓扑序执行,必须幂等
depends_on = ["worker"]             # 可选,控制启动顺序(被依赖者先)
shutdown_timeout_seconds = 30       # 可选,默认30,SIGTERM→等本值→SIGKILL

[health]                            # 整段可选,默认都是 /health
startup_path = "/health"
readiness_path = "/ready"           # 不ready摘流,不重启
liveness_path = "/health"           # 连续失败重启容器

[proxy]                             # 可选;worker禁止声明
path = "/api/"                      # 必填(若有本段),workspace内唯一,最多一个/
strip_prefix = true                 # 可选,默认false

[[logs.sources]]                    # 可选,可重复
id = "application"                  # DNS-1123,本service内唯一
glob = "app*.jsonl"                 # 相对日志目录,不含/或\
format = "jsonl"                    # jsonl / text
multiline_start_pattern = "^\\d+"   # 仅text可用,jsonl下写会报错

[env]
LOG_LEVEL = "debug"                 # 不能用保留键
# DATABASE_URL = "postgres://..."   # 敏感配置直接写这里(明文)
```

## 枚举值速查

| 字段 | 合法取值 |
|---|---|
| type | `node` / `java` / `python` / `go` / `rust` / `static` |
| kind | `web`(默认) / `worker` |
| pingap.mode | `managed`(默认) / `extend` / `custom` |
| logs.format | `jsonl` / `text` |

## 平台注入的保留环境变量(你的 [env] 不能覆盖)

| 变量 | 值 | 代码应该 |
|---|---|---|
| `PORT` | 平台分配的端口(4000–7999) | **监听 `0.0.0.0:$PORT`** |
| `HOSTNAME` | `0.0.0.0` | 绑到它 |
| `APP_LOG_DIR` | `/app/logs/<service_id>` | 日志文件写进这里 |
| `APP_SERVICE_ID` | 本服务的 service_id | 需要时读取 |
| `APP_RELEASE_ID` | 当前 release ID | 需要时读取 |

禁止 key:`PORT`、`HOST`、`HOSTNAME`、`APP_LOG_DIR`、`APP_SERVICE_ID`、`APP_RELEASE_ID`,以及 `RCODER_` 开头。

## 容器内固定目录

| 目录 | 内容 |
|---|---|
| `/app/code` | 当前激活的 release 代码 |
| `/app/data` | PostgreSQL 数据 + 用户持久数据 |
| `/app/logs/<service_id>/` | 每个 service 独立日志目录 |
| `/app/releases/` | 历史版本包 + 激活/回滚工作区 |

## 数据库(PostgreSQL)

容器自带 PostgreSQL(同容器 `localhost:5432`),数据落在持久卷(`/app/data/pg`)。

| 项 | 环境变量 | 默认值 |
|---|---|---|
| 用户名 | `POSTGRES_USER` | `app` |
| 密码 | `POSTGRES_PASSWORD` | 平台注入(本地兜底 `app`) |
| 默认库 | `POSTGRES_DB` | `app` |

连接串:`postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}`

> 不要在 `[env]` 里覆盖这些变量——会和 PG 实际凭据不一致。需要新库用平台「建库」操作。

## 校验规则完整清单(Fail-Fast)

- `schema_version` 须为 `1`;未知字段直接失败
- `service_id`:DNS-1123,workspace 内唯一
- argv(build.command/run.command/migrate):非空数组,每参数非空不含NUL
- 路径安全:artifact/config/glob 禁止绝对路径、`..`、symlink 逃逸;glob 禁含 `/`
- HTTP 路径:proxy.path 和 health path 须以 `/` 开头,不含 `..`/`?`/`#`
- 路由:proxy.path 在 enabled 服务间唯一;全 workspace 最多一个 `/`
- worker 不能声明 `[proxy]`
- depends_on:必须引用已存在且 enabled 的 service_id;不能自依赖/成环
- multiline_start_pattern 仅 text 可用
- 至少一个 enabled 服务
- managed 模式下不能写 pingap.config

## 常见错误对照

| 报错关键词 | 多半原因 | 怎么改 |
|---|---|---|
| `unsupported schema_version` | 漏写或不是1 | 加 `schema_version = 1` |
| `unknown field` | 拼错字段/多写字段 | 严格模式,只能写文档列出的字段 |
| `must be a DNS-1123 label` | service_id 含大写/下划线/点 | 小写字母数字加横杠 |
| `duplicate service_id` / `duplicate proxy path` | 重复 | 改唯一 |
| `multiple catch-all routes` | 两个服务都声明 `path = "/"` | 只留一个 `/` |
| `worker service must not declare [proxy]` | worker 配了代理 | 删掉 worker 的 [proxy] |
| `service ... depends on missing or disabled service` | depends_on 写错 | 填已存在且 enabled 的 service_id |
| `service dependency cycle` | 依赖成环 | 打破循环 |
| `env key is reserved by the runtime` | [env] 用了 PORT 等 | 换名,端口用 $PORT |
| `multiline_start_pattern is only valid for text logs` | jsonl 配了多行 | 删掉,或 format 改 text |
| `must be a safe relative path` | 绝对路径或 `..` | 改相对路径 |
