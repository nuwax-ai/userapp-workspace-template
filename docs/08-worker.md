# HTTP worker 与进程 worker

`kind="worker"` 只说明不公开代理路由，启动检查必须单独确定。

| 场景 | 模板 / 声明 | 启动依据 |
|---|---|---|
| 兼容已发布运行时的后台服务 | `add backend-python --kind worker` | 保留 FastAPI/Uvicorn 与 `$PORT`；旧引擎约定保持不变 |
| 明确不监听网络的常驻任务 | `add worker-python`，`[health].startup_probe="process"` | 同一受管根进程连续存活 5 秒，启动提交前再次核验 |
| 需要真实 HTTP / TCP 检查 | `startup_probe="http"` / `"tcp"` | 显式覆盖 devrun 的默认 TCP 与 supervisord 的默认进程确认 |

**版本门槛：新增 `startup_probe` 需要 app-cli >= 0.3.9，并且实际 owner 声明 `startup-probe-v1`。**
当前模板源码包含 `worker-python`；使用时通过已安装 CLI 的 `list` 确认模板可用，再核对运行时版本与 owner 能力。
CLI 包含模板不代表目标运行时已升级。无法确认能力时保留 HTTP worker，不能靠去掉健康检查绕过错误。

```bash
# 在已有包含 web 的 workspace 中追加纯 Python worker
template-cli add worker-python --service-id queue-worker
# 再加一个同类 worker，只换身份，不传 --path
template-cli add worker-python --service-id audit-worker
```

```toml
[project]
kind = "worker"
type = "python"

[health]
startup_probe = "process"
# 默认启动预算 25 秒；显式设置时必须大于 5 秒
```

这是 manifest 节选；使用 CLI 生成完整的 build/run/devrun 配置。保持 port 分配与 `PORT` 环境变量兼容，但 process worker 无需绑定端口。

## 约束与失败

- process 仅适用于非 static worker；不能有 `[proxy]`、HTTP 健康路径、workspace bridge 或 custom Pingap 的 `rcoder://` 上游引用。
- static 服务使用内置托管，不声明 `startup_probe`；三种显式策略只用于有受管进程的服务。
- managed workspace 至少要有一个 web 服务；纯 worker workspace 与一次性 Job 不在当前范围内。
- root 提前退出（包括 exit 0）、只剩孙进程、探测失败/超时/取消，都不能报告启动成功。
- 进程存活不证明队列、数据库或任务健康。原先依赖 HTTP 检查业务健康的 worker 不应为掩盖故障切到 process。
- 未填写 `startup_probe` 时保持原行为：builtin 的 devrun 检查 TCP、其余进程检查 readiness_path；supervisord 使用原有 startsecs/重试。
- 显式 HTTP 使用 readiness_path 的 HTTP 2xx；TCP 检查连接。startup_path/liveness_path 不因此变成持续运行的容器探针。
- worker 启动失败使该次操作失败，但 worker 不参与 web 业务可访问性聚合。管理探针、容器生命周期不由该字段重新定义。

## 存量应用

不会自动重写存量 workspace。维护者先核验运行时，再按需求选真实 HTTP 健康服务或显式 process。
系统提示词、skills 和 workspace 中已生成的 AGENTS.md 是不同分发面，升级 npm 不会更新后两者。
更新时只修改 worker 契约条款，保留用户代码、其他约束和数据。
