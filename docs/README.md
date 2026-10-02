# UserApp 开发者文档

这套文档面向**在 RCoder UserApp 平台上开发并部署应用的开发者**。它告诉你:平台和我们之间
的约定是什么、怎么写配置、怎么把代码构建并发布成一个能被访问的网页应用。

## 这是什么

UserApp 的核心模型是:**一个 `app_id` 对应一个 workspace;一个 workspace 可以包含多个不同语言
的服务(前端 + 后端、多个后端、带数据库的 Next.js 单体……);整个 workspace 作为一个整体被
构建、发布、回滚。**

你需要提供代码、一个 workspace manifest 和各编排服务的 manifest。镜像、资源、端口、反向代理这些平台都替你管了。

## 阅读路径

**第一次接触?** 按顺序读前两篇,就能把一个服务跑起来:

1. [核心概念与约定](01-concepts.md) — 先建立心智模型(app_id / workspace / service 是什么、平台负责什么、你负责什么、运行时给你什么)。**建议先读。**
2. [快速开始](02-quick-start.md) — 5 分钟:最小配置 → 构建 → 发布 → 访问。

**写配置时查这些:**

3. [Manifest 完整字段参考](03-manifest-reference.md) — `workspace.manifest.toml` 和 `project.manifest.toml` 的**每一个字段**:类型、是否必填、默认值、带注释的完整示例。写配置时的权威参考。
4. [反向代理与路由](04-pingap-routing.md) — 请求怎么从外面走到你的服务;三种代理模式;路由前缀怎么规划。

**进阶:**

5. [日志](05-logs.md) — 怎么声明日志源、怎么查询/订阅日志、怎么发现 service_id。
6. [部署、发布与回滚](06-deploy-release.md) — 构建产物长什么样、发布状态机、回滚、版本保留、数据库迁移约定、健康检查、常见错误排查。
7. [接入已有项目](07-import-existing-project.md) — 手动导入后由 agent 适配,保留原技术栈和 monorepo 布局,核对配置、构建与运行证据。
8. [Worker 模式](08-worker.md) — HTTP worker 与显式 process worker 的探测、编排和版本要求。

## 一句话速记

> 根目录写 `workspace.manifest.toml`,仅参与编排的一级服务目录写 `project.manifest.toml`。
> HTTP/TCP 进程监听 `0.0.0.0:$PORT`,文件日志使用 `$APP_LOG_DIR`,平台按声明构建并管理端口、镜像与反代。
