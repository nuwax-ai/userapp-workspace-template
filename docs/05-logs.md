# 日志

这篇讲:平台怎么收集你的日志、你怎么声明日志源(好让日志在面板里出现)、以及怎么在平台界面上查看日志。

---

## 1. 日志模型:两条来源

每个 service 的日志有两条来源,平台都会管:

| 来源 | 谁产生 | 怎么配置 |
|---|---|---|
| **应用文件日志** | 你的应用用日志框架写文件 | 在 `[[logs.sources]]` 声明 glob,**应用自己负责轮转** |
| **stdout/stderr 捕获** | 平台自动把每个服务的标准输出/错误捕获成文件 | 无需配置,自动生成 `runtime.out.log` / `runtime.err.log` |

两类文件都落在该服务的日志目录:

```
$APP_LOG_DIR/
```

> 注:stdout/stderr 会被自动捕获成文件,但要在日志面板查看,仍需在 `[[logs.sources]]` 里声明一个
> 匹配的 source(见 [§4](#4-查看日志))。

---

## 2. 声明日志源(`[[logs.sources]]`)

这是**你需要做的关键配置**:在 `project.manifest.toml` 里声明你的应用把日志写到了哪些文件,平台才
能在日志面板里展示它们。一个服务可声明多个 source(如 `application` + `access`)。

```toml
[[logs.sources]]
id      = "application"          # source 标识(DNS-1123,本服务内唯一)
glob    = "app*.jsonl"           # 匹配哪些文件(见下方规则)
format  = "jsonl"                # jsonl 或 text

[[logs.sources]]
id = "access"
glob = "access*.log"
format = "text"
```

### glob 规则(重要)

- **相对运行时注入的 `$APP_LOG_DIR`**,只匹配**文件名**;
- **不能含 `/` 或 `\`**——即不能跨目录匹配。`backend-go*.log*` ✅,`logs/app.log` ❌;
- 不能是绝对路径、不能含 `..`。

> 你的应用代码要把日志文件写到 `$APP_LOG_DIR`(平台注入的实际目录，不写死容器路径),
> 文件名要能被你声明的 glob 匹上。否则面板里看不到日志。

### `format`:jsonl vs text

- **`jsonl`**(推荐):每行一个 JSON 对象。平台能解析出 `level`、`timestamp` 等字段,支持按级别过滤。
- **`text`**:普通文本。按行处理;多行日志(如 Java 堆栈)可用 `multiline_start_pattern` 合并。

### `multiline_start_pattern`(仅 text)

用正则标记"一条多行日志的起始行"。常见场景:Java 异常堆栈——一个 `2026-08-05 ...` 开头的行
后面跟着若干行堆栈,用起始正则把它们合成一条:

```toml
[[logs.sources]]
id = "application"
glob = "backend-java.log*"
format = "text"
multiline_start_pattern = "^\\d{4}-\\d{2}-\\d{2}"   # 以日期开头的行 = 一条新日志的开始
```

> `multiline_start_pattern` **只能用于 `text`**。`jsonl` 下写它会校验失败(每行本来就是一条完整日志)。

---

## 3. 轮转建议(应用自己的责任)

平台**只读**日志文件,不替你轮转。你的应用框架要自己管,建议:

- 格式:JSONL;
- 按天 或 100 MiB 滚动;
- 保留 14 天;
- 用 copytruncate(避免文件句柄问题)或等价的框架配置。

平台捕获的 `runtime.*.log` 自己有轮转,不用你管。

---

## 4. 查看日志

### 构建或启动失败的任务日志

失败响应仍可能带 `data.task_id`（工具封装时可能位于 `error.data.task_id`）。用原 app_id 查询 `GET /api/v1/userapp/tasks/{task_id}?app_id=...` 或订阅 `GET /api/v1/userapp/tasks/{task_id}/logs/stream?app_id=...`，读取诊断及终态；task_id 为空时没有可回查任务，按返回的诊断处理。

诊断 `scope=task` 使用任务的 `workspace` 日志范围；`scope=service` 使用真实 service_id。`repair_target=project` 指向项目文件/字段修正，`platform` 指向平台配置或运行态恢复。源码根和服务正确时，不搬代码、删 owner 状态/锁或 pkill 解锁；按 [已有项目接入指引](07-import-existing-project.md) 保留操作身份并完成修复后的配置、构建和访问验证。

### 应用运行日志

应用跑起来后,在**平台的日志面板**查看日志。面板支持这些过滤维度:

| 维度 | 说明 |
|---|---|
| **service** | 选哪个服务看;默认全部 |
| **source** | 选该服务的哪些日志源(如 `application` / `access` / `runtime`);默认全部 |
| **级别** | 过滤 `WARN` / `ERROR` 等(**需日志是 jsonl** 才能按级别解析) |
| **关键词** | 按文本子串过滤 |
| **时间范围** | 按时间段筛选 |

几个值得知道的点:

- **忘了某个服务的 `service_id`?** 日志面板的服务下拉(或应用的「服务列表」)里会列出这个应用包含的
  所有 service 和 source——直接去那里看。
- 面板支持**实时跟踪**新日志;断线会自动重连续传,不用你操心。
- 某个日志源的文件读不到(比如还没生成),面板会提示该源出错,**但不影响**其他源正常展示。
- 平台会把每个服务的 stdout/stderr 捕获成日志目录里的 `runtime.out.log` / `runtime.err.log`。**要在
  面板里看到它们,需声明一个匹配的 source**(本模板前端用 `id = "runtime" glob = "runtime.*.log"`)——
  这是排查"服务起不来"的第一手信息,建议给每个服务都加上。

> 想在面板里看到结构化的应用日志(带级别、时间戳、可过滤),就在 `[[logs.sources]]` 里用
> `format = "jsonl"`,并让你的框架按 JSONL 写文件。这是声明日志源最主要的价值。

---

← 回到[文档首页](README.md)
