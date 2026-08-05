# 快速开始

目标:**5 分钟,把一个最小的服务跑起来并被外部访问。** 我们用一个 Go 后端做例子,但换成任何
语言(Node / Java / Python / Rust / 静态前端)流程完全一样——只是 `[build]` `[run]` 不同。

> 如果你已经有现成项目,看本文最后一节[导入已有项目](#导入已有项目)。

---

## Step 1:建目录结构

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
> 叫 `manifest.toml`、`project.toml`、`*.draft.toml` 都会被忽略(或对 draft 而言,只用于导入确认)。

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

健康检查:发布时平台会探活你声明的健康端点(默认 `/health`)。返回 2xx 才算就绪、才正式上线。

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

如果你已经有一个现成的项目(不是按本模板建的),用平台的**「导入项目」**功能:它会自动检测常见
项目描述文件(`package.json`、`pom.xml`、`go.mod`、`Cargo.toml`、`requirements.txt` 等,**只读不执行
任何脚本**),生成一个 `project.manifest.draft.toml` 草稿。

**关键:`.draft.toml` 不参与构建。** 你必须在界面上核对草稿里的 `build.command`、`artifact`、
`run.command`、`health`、`proxy`、`logs`,确认无误后才把它转成正式的 `project.manifest.toml`,
这个项目才会参与构建。

自动检测只是辅助,最终的构建/运行/路由配置**必须由你确认**——尤其是构建命令和产物路径,检测经常猜不准。

---

下一篇:[Manifest 完整字段参考](03-manifest-reference.md) ——每个字段的类型、默认值、完整示例。
