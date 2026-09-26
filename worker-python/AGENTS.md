# Python worker 契约

- 本模板需要 app-cli >= 0.3.9 与 `startup-probe-v1` 能力；运行时未升级时不要使用。
- `kind=worker` 不公开路由。无监听能力来自 `[health].startup_probe="process"`，不能只看 kind 或名称推断。
- 保持前台常驻主进程；初始化失败应报错退出。一次性任务、fork 后父进程退出，不属于该契约。
- process 仅证明同一根进程启动时连续存活 5 秒，不证明业务、数据库或队列健康。保留失败日志。
- 用有界任务或取消机制响应 SIGTERM/SIGINT。新增依赖时同步 build 产物和 run/devrun，不假设 prod 会安装依赖。
- 不声明 `[proxy]`、HTTP 健康路径或 workspace bridge；至少搭配一个 web 服务组成 managed workspace。
