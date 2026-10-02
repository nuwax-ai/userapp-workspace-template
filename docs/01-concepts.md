# 核心概念与约定

读完这篇你会理解:UserApp 的三个核心概念、平台和你各自的职责、应用从代码到上线的生命周期、
以及运行时平台会"免费"给你哪些东西。**先读这篇,再写配置。**

---

## 1. 三个核心概念

| 概念 | 是什么 | 例子 |
|---|---|---|
| **`app_id`** | 平台里一个应用的稳定 ID,对应**一个 workspace** 和一套持久存储。整个应用对外就用它标识。 | `app-e2e-go` |
| **workspace** | 你一次提交的**全部源码集合**——根目录一个 `workspace.manifest.toml`,下面若干子项目。它是**构建、发布、回滚的原子单位**(不能只发半个)。 | 整个仓库根目录 |
| **service** | workspace 里一个**可独立构建、启动、产日志的子项目**。每个 service 在一级服务目录里有一个 `project.manifest.toml`,也可通过适配目录调用原项目构建。 | `backend-go/`、`frontend-react/` |

一句话:`app_id` → 一个 `workspace` → 多个 `service`。

`app_id` 与 `conversation_id` 分别标识应用与对话，不能互换。workspace 使用平台提供的当前目录，
不根据会话 ID、用户 ID 推导路径；同一应用的后续开发应复用已有源码。
已有项目接入时保留原技术栈、业务、Git、根 lock 文件和 monorepo 共享依赖,见
[已有项目接入指引](07-import-existing-project.md)。

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
| 1 | **两级 Manifest** | workspace 根目录一个 `workspace.manifest.toml`,参与编排的一级服务目录各有 `project.manifest.toml`。其他目录无需 manifest；根目录和更深层的服务 manifest 不会被直接发现。 |
| 2 | **严格校验,Fail Fast** | 写错字段(拼写、未知字段、非法枚举、重复路由、依赖环……)**构建直接失败并报清楚原因**,不会带错误配置默默上线。每个配置段都是严格模式,多写一个字段也会报错。 |
| 3 | **端口由平台定** | HTTP/TCP 模板的进程服务保留 **`0.0.0.0:$PORT`** 监听与健康接口,HTTP worker 也一样；显式 process worker 见 [worker 模式](08-worker.md)；`type=static` 的 prod 由平台托管。`PORT` 是平台构建时确定并锁定的(范围 4000–7999)。**代码里硬编码端口 = 必错。** |
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
| 闲置回收、流量唤醒 | HTTP/TCP 进程监听 `0.0.0.0:$PORT`；process worker 保持常驻；日志写 `$APP_LOG_DIR` |

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
   下载与校验                核对制品完整性与身份，准备候选目录
        │
        ▼
   制品激活                  切到实际部署目录；部署段完成不代表业务 Ready
        │
        ▼
   服务编排与就绪核验        按探测策略启动；失败时查询操作错误与恢复状态
        │
        ▼
   运行中                     经应用子域名对外服务;日志可查;可被回收/唤醒
```

关键点:

- **失败不代表自动回滚**：新制品可能已激活，需读取实际版本与恢复状态；结果未知时继续原操作的恢复核验。
- **回滚 = 用仍可获取的历史制品重新部署**，仍有整组切换和启动过程；制品保留策略以平台版本管理为准。
- **回滚不执行数据库 down migration**——所以你的迁移必须幂等,且遵守 expand/contract。

详见 [部署、发布与回滚](06-deploy-release.md)。

---

## 6. 运行时:平台"免费"给你的东西

应用启动时,平台会给每个 service 注入环境变量并设置工作目录。代码使用这些实际值，不依赖固定容器布局。

### 注入的环境变量(都是保留的,你的 `[env]` 不能覆盖)

| 变量 | 值 | 你应该 |
|---|---|---|
| `PORT` | 平台分配的端口(4000–7999) | HTTP/TCP 进程监听 `0.0.0.0:$PORT`；process worker 不要求监听 |
| `HOSTNAME` | `0.0.0.0` | 绑到它 |
| `APP_LOG_DIR` | 运行时注入的服务日志目录 | 把日志文件写进这个目录 |
| `APP_SERVICE_ID` | 本服务的 `service_id` | 需要时读取 |
| `APP_RELEASE_ID` | 当前 release 的 ID | 需要时读取 |

> ⚠️ `[env]` 里的 key **不能**是 `PORT`、`HOST`、`HOSTNAME`、`APP_LOG_DIR`、`APP_SERVICE_ID`、
> `APP_RELEASE_ID`,也不能以 `RCODER_` 开头。这些是平台的。

### 工作目录与持久目录

| 定位方式 | 内容 |
|---|---|
| 平台提供的 workspace / 服务 cwd | 当前源码或激活后的服务产物，项目文件使用相对路径 |
| 实际持久卷与 `PGDATA` 配置 | PostgreSQL 等持久数据，停止/重启保留 |
| `$APP_LOG_DIR` | 当前服务的日志目录 |

RCoder UserApp 容器目前以 `/home/user` 为挂载根；独立 app-cli 由调用方指定目录。
CLI 默认 `/app/code`、`/app/logs` 不等于各部署的实际路径，不在业务代码中写死。

### 数据库(PostgreSQL)

RCoder 的 UserApp 运行镜像自带 PostgreSQL，跑在同一应用容器内，数据目录由 `PGDATA` 与持久卷配置确定。
数据库迁移通过 `run.migrate` 在服务启动前执行。RCoder 通过 `APP_CLI_REQUIRE_PG=1` 声明 PG 前置等待；
独立 app-cli 默认不做该探测，数据库由用户或客户端准备，允许远程主机与自定义端口。
已有项目沿用实际数据库方案,不因模板默认 PostgreSQL 就改写业务数据库；连接变量与迁移行为需按实际环境核对。

**连接信息**(容器环境变量,你的服务直接读):

| 项 | 环境变量 | 默认值 |
|---|---|---|
| 主机 | `PGHOST` 或连接串 | 容器通常为 `localhost`(`127.0.0.1`) |
| 端口 | `PGPORT` | `5432` |
| 用户名 | `POSTGRES_USER` | `dev` |
| 密码 | `POSTGRES_PASSWORD` | 平台注入时以注入值为准;未注入时 `dev` |
| 默认库 | `POSTGRES_DB` | `dev`(首次 initdb 时自动建) |

同容器连接串示例（其他环境使用实际主机/端口，连接参数解析以所选模板为准）:

```
postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}
```

几点说明:

- 需要新建数据库时,用平台的「建库」操作(经容器内 psql 执行),别自己在 migrate 里 `CREATE DATABASE`
  (没有 superuser 权限)。
- 数据库管理通过平台提供的入口访问，不假定管理台端口。
- 使用运行环境实际注入的凭据，不在 `[env]` 写入旧默认值覆盖。初次初始化的 `dev` 值不代表改密后的有效凭据。

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
