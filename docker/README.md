# Docker 本地验证

单容器复刻平台运行时（多语言工具链 + app-cli + pingap + PostgreSQL 16），让本仓库
**自包含**地完成本地验证闭环：

```
manifest 校验(gen-lock) → 7 服务全量编译(app-cli build) → 产物态运行(serve)
  → 经 pingap 9080 的路由冒烟断言(verify.sh)
```

不依赖 rcoder 仓库——app-cli 经 npm 平台包（`@nuwax-ai/app-cli`）装入镜像。

## 前置条件

| 项 | 要求 |
|---|---|
| npm 包 | 指定支持新子命令语法的已发布 `@nuwax-ai/app-cli` 版本，通过环境变量 `APP_CLI_VERSION` 传入构建（发版源 = rcoder 仓库 `crates/app-cli/Cargo.toml` + tag `app-cli-v*`） |
| Docker | 24+ / compose v2（Rancher Desktop 验证过） |
| 磁盘 | ~10GB（镜像 ~5GB + 缓存卷） |
| 内存 | 建议 Docker VM ≥ 8GB（JVM 编译 + Rust 链接 + 7 服务并发） |

## 快速开始

先将 `APP_CLI_VERSION` 设置为**实际已发布且支持新命令契约**的版本，再执行下列命令。此处不提供未经发布核验的版本号；RCoder 源码已修改不代表 npm 包已更新。空版本在 Docker 构建首步失败，旧命令版本在安装后的 CLI 能力检查失败，不回退旧语法。

```bash
# 在 shell 中 export APP_CLI_VERSION=<已核验的发布版本> 后：
make docker-verify   # 端到端：起容器 → 构建全部服务 → 运行 → 宿主机断言
```

首次运行在容器内下载全部依赖（Go/Maven/PyPI/crates/npm），约 10-20 分钟；缓存卷
命中后二次构建分钟级。其他命令：

```bash
make docker-dev        # dev 源码态：vite/next 热加载，改码即生效
make docker-shell      # 进容器排查（PG 已起，可 psql）
make docker-down       # 停容器（保留缓存卷）
make docker-down-clean # 停容器 + 删全部缓存卷（下次全量重建）
```

> `docker-verify` 与 `docker-dev` 端口互斥（同用 9080/3010），切换前先 `make docker-down`。

## 流程与文件

```
docker/
├── Dockerfile            # 多语言工具链 + app-cli(npm) + pingap + PG16
├── docker-compose.yml    # userapp(verify) / userapp-dev(dev profile) 两服务
├── entrypoint.sh         # 容器入口：起 PG(幂等 initdb) → 按 MODE 分派 → 优雅停
└── scripts/
    ├── container-verify.sh  # 容器内：gen-lock → build --deploy-dir → serve
    ├── container-dev.sh     # 容器内：gen-lock → build --dev → serve(dev profile)
    └── verify.sh            # 宿主机：9080 路由冒烟断言
```

**产物态 vs 源码态**：

- `verify` 模式产物解压到 `.docker-run/`（gitignored）——平台 `.run` 部署语义的
  本地等价（next 的 standalone zip 含精简版 package.json，不能解压回源码目录）；
- `dev` 模式产物落源码目录（平台源码态语义：`app.jar`/`dist` 在项目根，gitignored）。

## 端口

| 端口 | 用途 |
|---|---|
| 9080 | pingap 应用入口（对外访问经它路由到各服务） |
| 3010 | app-cli 管理 API（`/ready` 等） |
| 5432 | PostgreSQL（仅容器内，不对外发布） |
| 9081 | workspace index 兜底页——本模板不启用（`userapp-next` 的 `[proxy].path="/"` 独占根路由后 index.html 不被托管） |

## 国内镜像加速

`docker/Dockerfile` 的 ARG 默认走国内镜像（apt 阿里云 / npmmirror / goproxy.cn /
aliyun pypi / maven aliyun / rsproxy），`GITHUB_PROXY` 可给 pingap 下载加代理前缀。
切回官方源：在 `docker-compose.yml` 的 `build.args` 覆盖（文件内有注释示例）。

> app-cli 安装默认走官方 `registry.npmjs.org`（`APP_CLI_REGISTRY`）：新发布的包
> npmmirror 有同步延迟（分钟~小时），镜像构建期 404 会直接失败。

## 构建缓存与卷

| 卷 | 内容 |
|---|---|
| userapp-pgdata | PG 数据（重启不重 initdb） |
| userapp-node-{next,react,vue} | node_modules 卷影（macOS bind mount 性能） |
| userapp-rust-target / java-target | target/ 卷影 |
| userapp-m2 | maven 发行版（mvnw 自下 3.9.16）+ 全部依赖 |
| userapp-pnpm-store | pnpm store |
| userapp-go-cache | GOCACHE + pip 缓存 |
| userapp-gopath | GOPATH module cache |
| userapp-cargo-registry | cargo registry |

`make docker-down` 保留全部卷（二次构建快）；`docker-down-clean` 清空。

## macOS bind mount 注意

- vite 热加载需要文件监听轮询——dev 服务已注入 `CHOKIDAR_USEPOLLING=1`；
- 重目录（node_modules/target）已卷影，产物落宿主树略慢属 VirtioFS 预期。

## 边界声明（本地验证 ≠ 平台构建）

本地流程覆盖：**manifest 合法性、构建命令可产 artifact、产物态可服务、路由拓扑
正确（strip_prefix/静态托管/catch-all）**。不覆盖平台构建期行为：发布 zip 完整性
校验、static 产物路由一致性检查（frontend-detector）、制品上传与 RBD 部署链路、
发布状态机、日志采集语义。发布链路验证请在平台上进行。

## 排障

```bash
docker logs -f userapp-local              # 容器整体日志（entrypoint + 构建 + serve）
docker exec userapp-local ls /app/logs/   # app-cli 日志 + 各服务 runtime.{out,err}.log
make docker-shell                         # 进容器（PG 已起：psql -h 127.0.0.1 -U app）
```

常见失败：内存不足（JVM/Rust 链接被 OOM kill → 调大 Docker VM 内存）；首跑网络
超时（重跑 `make docker-verify`，缓存卷续传）；app-cli 安装 404（npm 包版本未对齐
或 registry 不通 → 检查 `APP_CLI_VERSION` / `APP_CLI_REGISTRY`）。

## CLI 契约同步（2026-09-18）

容器脚本统一为 `gen-lock --workspace`、`build --workspace`、`serve --workspace`。
之前固定的 app-cli 0.2.2 已移除，构建前必须选择包含此次 CLI 调整的已发布版本。
更新 app-cli 时还需核对匹配的 Pingap 分发版本；本文件夹默认 `PINGAP_VERSION=0.14.3`
未作为本轮配对兼容性验证结论。新版本镜像需通过配置校验和完整 docker-verify 才能验收。

本轮只完成命令、文档、构建参数检查：未发布 npm、未构建镜像、未运行七服务集成验证。

## 本地环境与平台版本边界

本地 Docker 使用 Debian trixie / Python 3.13、Node 22、pnpm 10 和 Rust stable，
默认 Pingap 0.14.3。Python 原生依赖的构建与运行仍须核对实际 Python minor、系统库和 CPU 架构；
版本相同不代表镜像 digest 或平台部署已经验收。不得用宿主机的其他 Python/Node 版本结果代替。

`run.migrate` 告警后继续启动、`run` 转交独立常驻 owner 的本轮契约需要 app-cli >=0.3.16。
构建前核验 `APP_CLI_VERSION` 的实际 npm 发布状态，并核验该版本与 Pingap 的配置配对。
只修改 RCoder 源码或只发布模板 CLI 不会让旧 npm app-cli 获得这些修复；包未发布时应记录前置受阻。
