# 快速开始

目标:**5 分钟,把一个最小的服务跑起来并被外部访问。** 我们用一个 Go 后端做例子,但换成任何
语言(Node / Java / Python / Rust / 静态前端)流程完全一样——只是 `[build]` `[run]` 不同。

> 如果你已经有现成项目,看本文最后一节[导入已有项目](#导入已有项目)。

---

## Step 1:建目录结构

**平台开发**以平台工作区契约返回的 `workspace_root` 为固定源码根；先核对 cwd 与其一致，再记录 `SOURCE_WORKSPACE=$PWD`，不能把服务子目录的 cwd 当成应用根。需要模板时执行 `npx @nuwax-ai/template-cli init "$SOURCE_WORKSPACE" --backend go`；仅有元数据、用户说明或平台预建空目录不改到下一层。安装版因非空拒绝时可在工作区外临时生成，再最小合入原根，保留既有文件。`code/` 内已有完整业务则走[已有项目适配](07-import-existing-project.md)。

**独立客户端**可以按用户选择执行 `init my-app --backend go`，进入生成目录后记录自己的源码根。下方 `my-app/` 是 workspace 结构示意，平台不用另建该目录。

一个 workspace 至少要有:根目录一个 `workspace.manifest.toml` + 一个子项目目录(里面一个
`project.manifest.toml`)。

```text
my-app/
├── workspace.manifest.toml
└── api/
    ├── project.manifest.toml
    ├── scripts/
    │   └── build-standalone.sh      ← 构建脚本,产出 artifact.zip
    ├── go.mod
    ├── main.go
    └── ...
```

> 平台**只扫描一级子目录**,而且**只认文件名正好叫 `project.manifest.toml` 的**。
> 根目录或更深层的服务 manifest 不会被直接发现；`manifest.toml`、`project.toml`、`*.draft.toml` 都不参与编排。

## Step 2:写两个 manifest

**根目录 `workspace.manifest.toml`**——最小到只需要两行有效配置:

```toml
schema_version = 1

[workspace]
name = "my-app"
```

(`[pingap]` 默认就是 `managed` 模式,平台按各服务的 `[proxy]` 自动生成路由,不用写。)

**子项目 `api/project.manifest.toml`**——一个对外的 web 服务,最小配置长这样:

```toml
schema_version = 1

[project]
service_id = "api"            # 服务的稳定身份,小写字母/数字/横杠
name = "My API"
type = "go"                   # node / java / python / go / rust / static

[build]
command = ["sh", "scripts/build-standalone.sh"]
artifact = "artifact.zip"     # 构建脚本必须产出这个文件

[run]
command = ["./server"]        # 启动命令;服务要监听 0.0.0.0:$PORT

[proxy]
path = "/api/"                # 对外路由前缀
strip_prefix = true           # 后端按根路径写(/health);剥掉 /api/ 前缀再转给后端
```

这就够了。`kind`(默认 `web`)、`enabled`(默认 `true`)、`migrate`/`depends_on`(默认空)、
`shutdown_timeout_seconds`(默认 30)、`[health]`(默认 `/health`)、`[logs]`、`[env]` 都可省。
完整字段见 [Manifest 字段参考](03-manifest-reference.md)。

## Step 3:写构建脚本

`build.command` 是 argv 数组,这里调 `scripts/build-standalone.sh`。脚本的工作目录就是子项目
目录(`my-app/api/`)。它**必须产出 `artifact` 声明的文件**(这里是 `artifact.zip`),且 zip 根
直接是运行所需文件,不要再套一层顶层目录。

```bash
# api/scripts/build-standalone.sh
#!/usr/bin/env sh
set -e

# 编译
CGO_ENABLED=0 go build -o server .

# 打包成 manifest 声明的 artifact
# (zip 根直接是运行文件,不套顶层目录)
zip -r artifact.zip server
```

> 运行命令 `["./server"]` 会在解压后的产物目录里执行,所以 `server` 要在 zip 根。

## Step 4:本地自测构建脚本(强烈建议)

提交前先在本地跑一遍,确保 `build.command` 能成功产出 `artifact`:

```bash
cd api
sh scripts/build-standalone.sh
# 检查 artifact.zip 生成了
unzip -l artifact.zip
```

本地通过,平台构建基本就稳了。绝大多数构建失败都是脚本本身的问题(依赖没装、路径不对、没产出 artifact)。

## Step 5:触发构建与发布

先核对 `app-cli validate --help`，安装版提供该命令时对原始源码根执行 `app-cli validate --workspace "$SOURCE_WORKSPACE"`；有 dev 运行方式时追加 `--dev`，检查退出码和预期服务清单。刚在 `api/` 等子目录构建后也使用同一个根，不能用内层工程或 `.run/` 的校验替代平台源码检查。配置通过只证明配置有效。

代码和配置就绪后,在**平台界面上**操作你的应用:

- **「发布」按钮**(有时叫「构建并发布」/「部署」)——一键完成:构建 → 准备 → 激活 → 就绪确认。
  这是最常用的入口,点一下就行。
- **「构建」按钮**——只构建、产出发布包,**不部署**。适合先验证构建能不能通过。

发布过程中,界面会**实时显示进度**:每个 service 的构建状态(构建中 / 成功 / 失败),以及随后的
激活、健康确认阶段。全部通过后应用就正式上线了。某个 service 构建失败,界面会指出是哪个、报什么错。

> 构建在哪儿发生?在平台为这个 app 准备的**构建容器**里——你的 workspace 源码会被放进去执行构建。
> 所以构建环境里有什么工具链(Node / Java / Go 版本等),取决于平台提供的构建镜像。如果构建报
> "版本不支持"类错误,多半是构建镜像的工具链版本和你的项目要求不匹配(比如项目要 Java 25,镜像只有 17)。

## Step 6:访问你的服务

发布成功后,平台会为你的应用分配一个**专属子域名**(在应用详情页能看到,形如
`https://{应用标识}.<平台域名>`)。你声明的每个 `[proxy].path`,都是这个子域名下的路径前缀。

例如上面声明的 `path = "/api/"`,你的 Go 服务有个 `GET /health`,那对外访问地址是:

```
https://{应用子域名}/api/health
```

> 你不用关心流量具体怎么走到服务——平台把子域名的请求转给应用容器内的反向代理,由它按 `[proxy]`
> 规则分发到各服务。`strip_prefix`(默认 `false`)控制是否把前缀剥掉再转给后端,API 后端通常设
> `true`。详见 [反向代理与路由](04-pingap-routing.md)。

> **入口默认页**:workspace 根放一个 `index.html`(CLI init 会自动生成导航页),访问根路径 `/`
> 与未匹配路径时兜底展示它,可自行修改(改完刷新即生效)。某服务声明 `[proxy].path = "/"`
> (catch-all)时它独占根路由,`index.html` 不生效——服务路由恒优先。

健康检查:发布时平台会探活你声明的健康端点(默认 `/health`)。返回 2xx 才算就绪、才正式上线。界面/调用方判断"应用是否可访问"用平台的只读就绪查询 `GET /api/v1/userapp/{app_id}/{app_stage}/readiness`(`app_stage` 为 `dev`/`prod`;查询恒 200,`data.ready` 才表示业务可用,查询本身不会启动或唤醒服务)。

---

## 多个服务怎么加

快速开始只放了一个 service。要加更多,就多建几个一级子目录,各放一个 `project.manifest.toml`:

```text
my-app/
├── workspace.manifest.toml
├── api/            ← 后端,path = "/api/"
└── web/            ← 前端,path = "/" 或 "/app"
```

注意事项:

- 每个 service 的 `service_id` 必须在 workspace 内**唯一**;
- 每个 `[proxy].path` 必须唯一;**全 workspace 最多一个 `/`**(catch-all,通常给主前端);
- 前端依赖后端时,可用 `depends_on` 控制启动顺序(后端先起)。

完整的路由规划和多服务示例见 [反向代理与路由](04-pingap-routing.md)。

---

## 导入已有项目

已有业务需要接入平台，或完整工程已位于平台子目录时，请 agent 按
[已有项目接入指引](07-import-existing-project.md) 增量适配。保留原技术栈、业务、Git、根 lock 文件
和 monorepo 共享依赖。仅参与编排的一级服务目录需要 `project.manifest.toml`；可用一级适配目录
调用原根构建,无需拆散 `apps/`、`packages/`。`init` 用于没有业务的新 workspace；元数据或预建空目录按第 1 步处理，已有工程按接入指引保留并适配。

平台已有 detect 能辅助识别项目描述文件,不执行项目脚本,但会写入 `project.manifest.draft.toml`
草稿。不要假定 ZIP 导入会自动调用 detect 或存在确认界面。**草稿不参与编排**,agent 应根据
实际项目核对构建、产物、运行、探测和路由,再写正式 manifest。

先执行 `app-cli validate --help` 确认安装能力，支持时做只读配置检查：

```bash
app-cli validate --workspace "$SOURCE_WORKSPACE"
# 有开发运行方式时另检 dev 代理规则
app-cli validate --workspace "$SOURCE_WORKSPACE" --dev
```

命令不生成 lock、不构建、不启动。退出码 0/1/2/3 分别表示配置通过、配置错误、参数错误、
观察/内部失败；核对诊断与预期服务清单。未提供 validate 的旧版兼容检查见
[导入指引](07-import-existing-project.md)，不要自行替换平台工具或以命令缺失新增启停门禁。
编排需要的派生 `release.lock.toml` 仍由 gen-lock 生成。配置通过不等于导入完成，
还需验证实际 dev 准备与启动、生产构建、独立产物运行和页面/API。

---

下一篇:[Manifest 完整字段参考](03-manifest-reference.md) ——每个字段的类型、默认值、完整示例。
