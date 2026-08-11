---
name: userapp-deploy
description: >
  UserApp workspace 的部署、发布、日志、回滚与排错指南。当用户需要发布应用、
  查看日志、排查部署失败、处理健康检查问题、回滚版本、或编写数据库迁移时使用。
  覆盖:发布状态机、健康探针、优雅关闭、日志声明与查询、版本保留、回滚、
  迁移幂等约定、闲置回收、常见错误排查。
  触发词:发布、部署、上线、回滚、日志、健康检查、探针、readiness、liveness、
  SIGTERM、优雅关闭、迁移、migrate、启动失败、502、404、版本、闲置回收。
---

# UserApp 部署、发布与回滚

## 发布链路

```
你的代码 + manifest
    │  (点「发布」)
    ▼
   构建每个 service       平台严格校验 manifest,逐个跑 build.command
    │
    ▼
   release.lock.toml      不可变快照:拓扑顺序、端口、路由、日志源、运行时版本
    │
    ▼
   发布包                 workspace-package-<release_id>.zip
    │
    ▼
   prepare(准备)          下载、SHA-256 校验、存档 → Prepared
    │
    ▼
   activate(激活)         切到 /app/code、启动服务 → PendingStart
    │
    ▼
   confirm(确认)          探活健康端点 → Active(或 Failed+自动回滚)
```

## 发布状态

| 状态 | 含义 |
|---|---|
| `Prepared` | 发布包已下载、校验、存档 |
| `PendingStart` | 代码已切换,服务启动中,等就绪确认 |
| `Active` | 已确认健康,当前对外服务的权威版本 |
| `Failed` | 激活/确认失败(已自动回滚到旧版本) |

> 正常发布在界面点「发布」即可,一键完成。了解阶段是为了出问题时知道卡在哪。

## 健康检查

平台用三个探针(发 GET,期望 2xx):

| 探针 | 默认路径 | 失败后果 |
|---|---|---|
| **startup**(启动) | `/health` | 决定服务是否启动完成 |
| **readiness**(就绪) | `/health` | 不 ready → **摘流**(不转发请求),不重启 |
| **liveness**(存活) | `/health` | 连续失败 → **重启容器** |

```toml
[health]
startup_path = "/health"
readiness_path = "/ready"      # 建议做更深的检查(含 DB 等依赖)
liveness_path = "/health"
```

**建议**:
- `readiness` 覆盖数据库等必需依赖(连不上 DB 返非2xx,让平台摘流)
- `liveness` 只反映进程本身(别把外部依赖放进 liveness,否则依赖抖动会反复重启)

### workspace 级就绪桥接(可选)

默认平台自给 `/health` + `/ready`。若想让"某后端 ready = 整个 app ready":

```toml
# workspace.manifest.toml
[health]
bridge_service = "api"       # 填某 service_id
```

后端不 ready → 整个应用摘流(NotReady),但 `/health` 仍 200(不重启,方便排查)。

## 日志

### 两条来源

| 来源 | 谁产生 | 怎么配 |
|---|---|---|
| **应用文件日志** | 你的日志框架写文件 | `[[logs.sources]]` 声明 glob |
| **stdout/stderr 捕获** | 平台自动捕获成文件 | 无需配置,自动生成 `runtime.out.log`/`runtime.err.log` |

日志目录:`/app/logs/<service_id>/`

### 声明日志源(关键配置)

```toml
[[logs.sources]]
id = "application"          # DNS-1123,本 service 内唯一
glob = "app*.jsonl"          # 相对日志目录,只匹配文件名,不含/或\
format = "jsonl"             # jsonl(推荐,可按级别过滤) / text
multiline_start_pattern = "^\\d{4}-\\d{2}-\\d{2}"  # 仅 text(如 Java 堆栈)
```

> stdout/stderr 要在面板看到,需声明一个匹配的 source(如 `id="runtime" glob="runtime.*.log"`)。

### 轮转建议(应用自己负责)

平台只读不写不轮转。建议:JSONL、按天或 100MiB 滚动、保留 14 天、copytruncate。

### 查看日志

平台日志面板:按 service / source / 级别(需 jsonl) / 关键词 / 时间过滤。

> 忘了 service_id?日志面板的服务下拉会列出所有 service 和 source。

## 回滚

**回滚 = 重新激活一个历史保留版本。** 在版本列表选历史版本点「回滚」。

> ⚠️ **回滚不执行数据库 down migration。** 代码退回旧版,但 schema 不退。所以迁移必须保证新旧代码短期都能兼容同一套 schema。

## 版本保留

- 默认保留最近 **15 个成功版本**(可配 2–100)
- 当前 Active 版本**始终保护**,不会被清理
- 只有成功上线后才触发清理
- 失败的包不计入成功版本数

## 数据库迁移约定(重要)

`run.migrate` 在启动**前**、按拓扑顺序执行。任一 service migration 失败 → 整个 workspace 启动失败。

必须遵守:
1. **幂等** — migrate 可能多次跑,重复执行不能报错
2. **新旧代码短期兼容同一 schema** — 回滚时代码退回旧版,schema 不退
3. **先 expand,再发代码,最后 contract** — 加列先加(兼容旧代码),删列等旧代码下线后再删
4. **平台不执行 down migration**

## 优雅关闭

平台向每个服务发 `SIGTERM`,等待 `shutdown_timeout_seconds`(默认30s),超时 `SIGKILL`。

服务收到 `SIGTERM` 应该:停止接新请求 → 处理完在途请求 → 关 DB 连接 → 退出。

## 闲置回收

平台对长时间无访问的应用自动回收(缩到 0 副本,**不删任何资源**)。下次有请求自动唤醒(首次多等几秒到几十秒)。代码正常监听 `$PORT` 即可,不需特殊处理。

## 常见发布错误排查

| 现象 | 可能原因 | 怎么查/改 |
|---|---|---|
| 构建阶段失败 | manifest 校验不过 / build.command 报错 / 没产出 artifact | 看界面哪个 service 失败及报错;本地先跑 build 脚本 |
| `release version not supported` | 构建镜像工具链版本低于项目要求 | 降项目目标版本,或等平台升级构建镜像 |
| 激活后一直不 Ready,Failed 回滚 | health 路径不对 / 服务崩溃 / 端口没监听 `$PORT` / DB 连不上 | 看日志面板 stdout/stderr;确认监听 `$PORT` 非硬编码;确认 health 返 2xx |
| readiness 一直不就绪 | readiness 检查了 DB 等依赖,而依赖没起 | 临时设成轻量路径(如 `/health`)确认服务本身没问题 |
| 外部访问 502/404 | `[proxy].path` 没配/配错/服务没监听 `$PORT` | 确认 path 拼写;看日志确认服务收到请求 |
| 日志面板查不到 | glob 没匹配实际文件名 / 日志没写到 `$APP_LOG_DIR` | 检查 glob 和写文件路径;看 runtime source 定位启动报错 |
| 回滚后服务报错 | 迁移非幂等 / 新 schema 旧代码不兼容 | 修迁移(幂等+expand/contract) |
