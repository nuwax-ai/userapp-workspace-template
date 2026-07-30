# UserApp 模板开发指南（Manifest v1）

此文档只描述模板作者必须遵守的约定。完整字段、Pingap、日志、发布与导入协议以 rcoder
仓库的 `docs/userapp-workspace/` 为准。

## 必需文件

每个一级项目目录包含：

```text
project.manifest.toml
scripts/build-standalone.sh
语言依赖文件和源码
```

构建脚本必须生成 manifest 中声明的 zip，且 zip 根直接是运行文件，不额外套顶层目录。

## 运行约定

- web 服务监听 `0.0.0.0:$PORT`。
- 将生产日志写到 `$APP_LOG_DIR`，文件名与 `[[logs.sources]].glob` 一致。
- 应用框架负责日志轮转；建议 JSONL、100 MiB/天、保留 14 天。
- 健康端点无外部依赖时返回 200；readiness 应覆盖数据库等必需依赖。
- migration 必须幂等，数据库变更采用 expand/contract，平台不会执行 down migration。
- 不覆盖 `PORT`、`HOSTNAME`、`APP_LOG_DIR`、`APP_SERVICE_ID` 和 `RCODER_*`。

## Manifest 清单

- `schema_version = 1`
- 稳定且唯一的 DNS-1123 `service_id`
- `type` 和 `kind`
- argv 形式的 `build.command`、`run.command`、`run.migrate`
- 明确的 startup/readiness/liveness
- worker 不声明 proxy
- web 路由不重复，最多一个 `/`
- 日志 glob 只写相对文件名，不含目录或 `..`

可使用 rcoder 的共享校验器检查整个模板：

```sh
cargo run -p workspace-manifest --example validate -- \
  /path/to/userapp-workspace-template
```

## 语言建议

| 类型 | 构建产物 | 运行命令示例 |
|---|---|---|
| Next.js standalone | server.js、静态资源、migration bundle | `["node","server.js"]` |
| React/Vue Vite | dist 静态文件 + 小型服务器 | `["node","static-server.cjs"]` |
| Go | 静态或自包含 server | `["./server"]` |
| Java | app.jar | `["java","-jar","app.jar"]` |
| Python | main.py、包和 vendored deps | `["python3","main.py"]` |
| Rust | server | `["./server"]` |

导入已有项目时先调用 detect 生成 draft。必须由开发者确认 build、artifact、run、health、
proxy 和 logs 后再 confirm；draft 永远不参与构建。
