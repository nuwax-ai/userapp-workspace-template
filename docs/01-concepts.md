# 核心概念与约定

读完这篇你会理解:UserApp 的三个核心概念、平台和你各自的职责、应用从代码到上线的生命周期、
以及运行时平台会"免费"给你哪些东西。**先读这篇,再写配置。**

---

## 1. 三个核心概念

| 概念 | 是什么 | 例子 |
|---|---|---|
| **`app_id`** | 平台里一个应用的稳定 ID,对应**一个 workspace** 和一套持久存储。整个应用对外就用它标识。 | `app-e2e-go` |
| **workspace** | 你一次提交的**全部源码集合**——根目录一个 `workspace.manifest.toml`,下面若干子项目。它是**构建、发布、回滚的原子单位**(不能只发半个)。 | 整个仓库根目录 |
| **service** | workspace 里一个**可独立构建、启动、产日志的子项目**。每个 service 在自己的子目录里有一个 `project.manifest.toml`。 | `backend-go/`、`frontend-react/` |

一句话:`app_id` → 一个 `workspace` → 多个 `service`。

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

---

## 2. 为什么 workspace 是"发布原子"

你**不能**单独发布或回滚 workspace 里的某一个 service——必须整套一起上。这是有意的:

- 前后端的 API 契约、路由必须配套;
- 数据库迁移要和代码同步;
- 反向代理的有效配置依赖所有 service 的端口和路由;
- 单服务回滚容易产生跨版本不兼容。

所以:**构建、发布、激活、确认、回滚、版本保留,全部以 workspace 为单位。** 你新增/改动一个服务时,
把它和其他服务当成一个整体来对待。

---

## 3. 六条核心原则(避免 90% 的配置错误)

| # | 原则 | 对你的影响 |
|---|---|---|
| 1 | **两级 Manifest** | 根目录一个 `workspace.manifest.toml`,每个一级子目录一个 `project.manifest.toml`。平台只认这两个确切文件名。 |
| 2 | **严格校验,Fail Fast** | 写错字段(拼写、未知字段、非法枚举、重复路由、依赖环……)**构建直接失败并报清楚原因**,不会带错误配置默默上线。每个配置段都是严格模式,多写一个字段也会报错。 |
| 3 | **端口由平台定** | 服务**必须监听 `0.0.0.0:$PORT`**。`PORT` 是平台构建时确定并锁定的(范围 4000–7999)。**代码里硬编码端口 = 必错。** |
| 4 | **镜像/资源/端口由平台管** | 运行时镜像、CPU/内存、存储大小、版本保留数都是**平台策略**,不在 TOML 里。需要的环境变量(含数据库连接串、API Key 等)写在 `[env]` 里,以明文随源码和发布包保存——按应用的访问范围评估其敏感度即可。 |
| 5 | **`service_id` 是稳定身份** | 服务的真实身份是 `service_id`,**不是目录名**。它决定日志目录、路由 upstream、依赖引用。一旦上线就别随便改。 |
| 6 | **构建/运行命令是 argv,不走 shell** | `build.command` / `run.command` / `run.migrate` 是字符串数组,直接执行。需要 shell 功能就显式写 `["sh","-c","..."]`。 |

---

## 4. 职责边界:平台负责 vs 你负责

清楚这条线,就知道哪些事你管、哪些事不用你管。

| 平台负责(你**不用**配置) | 你负责(你必须提供) |
|---|---|
| 运行时镜像(app-runtime,含 Node/Python/Java/Go/Rust 工具链) | 业务代码 |
| CPU / 内存 / 存储配额 | 两个 manifest 文件 |
| 给每个服务分配确定性端口(`PORT`) | 构建脚本(`scripts/build-standalone.sh` 等) |
| 应用子域名 + 容器内反向代理(路由分发) | 服务的启动命令、健康端点 |
| 多服务进程编排、启动顺序、优雅关闭 | 声明路由前缀 `[proxy]`、日志源 `[[logs.sources]]` |
| 版本包管理、激活、回滚、保留 | 数据库迁移脚本(且保证幂等) |
| 文件日志聚合查询、stdout 捕获 | 应用日志框架(写文件 + 轮转) |
| 闲置回收、流量唤醒 | 监听 `0.0.0.0:$PORT`、日志写 `$APP_LOG_DIR` |

---

## 5. 应用生命周期:从代码到上线

```
你的代码 + manifest
        │  (你触发构建)
        ▼
   构建每个 service          平台严格校验 manifest,逐个 service 跑 build.command
        │
        ▼
   生成 release.lock.toml     不可变快照:锁定拓扑顺序、端口、路由、日志源、运行时版本
        │
        ▼
   组装发布包                 workspace-package-<release_id>.zip(含 manifest + lock + 各服务产物)
        │
        ▼
   prepare(准备)             下载、校验 SHA-256、存档。release → Prepared
        │
        ▼
   activate(激活)             解压、切到 /app/code、启动服务。release → PendingStart
        │
        ▼
   confirm(确认)              平台探活健康端点;健康 → Active;不健康 → 自动回滚
        │
        ▼
   运行中                     经应用子域名对外服务;日志可查;可被回收/唤醒
```

关键点:

- **回滚 = 激活任意一个历史保留版本**(短暂停机整组切换)。没有单独的"回滚"动作。
- **默认保留最近 15 个成功版本**,可按应用配置 2–100;当前运行版本始终保护。
- **回滚不执行数据库 down migration**——所以你的迁移必须幂等,且遵守 expand/contract。

详见 [部署、发布与回滚](06-deploy-release.md)。

---

## 6. 运行时:平台"免费"给你的东西

应用启动时,平台会给每个 service 注入一组**环境变量**和**固定目录**。你的代码照约定用就行。

### 注入的环境变量(都是保留的,你的 `[env]` 不能覆盖)

| 变量 | 值 | 你应该 |
|---|---|---|
| `PORT` | 平台分配的端口(4000–7999) | **监听 `0.0.0.0:$PORT`** |
| `HOSTNAME` | `0.0.0.0` | 绑到它 |
| `APP_LOG_DIR` | `/app/logs/<service_id>` | 把日志文件写进这个目录 |
| `APP_SERVICE_ID` | 本服务的 `service_id` | 需要时读取 |
| `APP_RELEASE_ID` | 当前 release 的 ID | 需要时读取 |

> ⚠️ `[env]` 里的 key **不能**是 `PORT`、`HOST`、`HOSTNAME`、`APP_LOG_DIR`、`APP_SERVICE_ID`、
> `APP_RELEASE_ID`,也不能以 `RCODER_` 开头。这些是平台的。

### 容器内固定目录

| 目录 | 内容 |
|---|---|
| `/app/code` | 当前激活的 release 代码(你的服务在这里跑) |
| `/app/data` | PostgreSQL 数据 + 你的持久数据 |
| `/app/logs/<service_id>/` | 每个 service 独立的日志目录 |
| `/app/releases/` | 历史版本包 + 激活/回滚的内部工作区 |

### 数据库(PostgreSQL)

app-runtime 镜像自带 PostgreSQL(和 pgweb 管理台),跑在**同一个应用容器**里,数据落在应用持久卷
(`/app/data/pg`,重启不丢)。你的服务用本地连接串连它;数据库迁移通过 `run.migrate` 在服务启动前
执行(平台会先等 PG 就绪再跑 migrate)。

**连接信息**(容器环境变量,你的服务直接读):

| 项 | 环境变量 | 默认值 |
|---|---|---|
| 主机 | 直连同容器 | `localhost`(`127.0.0.1`) |
| 端口 | `PGPORT` | `5432` |
| 用户名 | `POSTGRES_USER` | `app` |
| 密码 | `POSTGRES_PASSWORD` | 平台注入(本地兜底 `app`) |
| 默认库 | `POSTGRES_DB` | `app`(首次 initdb 时自动建) |

连接串示例:

```
postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}
```

几点说明:

- 需要新建数据库时,用平台的「建库」操作(经容器内 psql 执行),别自己在 migrate 里 `CREATE DATABASE`
  (没有 superuser 权限)。
- pgweb(PG 的 web 管理台)在容器内 `8081`,经平台暴露后可用来查库。
- 这些是**容器继承的环境变量**,直接读即可;**不要在 `[env]` 里覆盖**它们——会和 PG 实际凭据不一致,
  导致服务连不上库。

---

## 7. 严格校验为什么是好事

平台对所有 manifest 做**严格校验**:未知字段、非法枚举、重复路由、依赖环、危险路径……一律
**构建时立即失败**并给出明确原因。这看起来"严格",但好处是:

- 配置错误**永远进不了生产**——不会带着半截路由或冲突的依赖默默上线;
- 报错信息指向具体字段和原因,定位快;
- `schema_version` 标记配置版本(当前 1),平台升级时据此做兼容/迁移判断——向前兼容,你已有的配置不会因平台升级而失效。

校验规则的完整清单见 [Manifest 字段参考 §校验规则](03-manifest-reference.md#四校验规则完整清单)。

---

下一篇:[快速开始](02-quick-start.md) ——用最小配置把一个服务跑起来。
