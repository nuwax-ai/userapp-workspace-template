# Python 常驻 worker

需要实际 app-cli >= 0.3.9，且 owner 声明 `startup-probe-v1`。先用已安装的 `template-cli list` 确认包含 `worker-python`，再核对运行时版本与能力；CLI 包含模板不代表运行时已升级。无法确认能力时保留 HTTP worker，不能靠去掉健康检查绕过错误。

在包含 web 服务的 workspace 中执行 `template-cli add worker-python --service-id queue-worker`。
无需 HTTP listener 或第三方库。`main.py` 的任务循环中实现实际工作，初始化错误直接传播。

开发命令：`python3 main.py`。制品构建：`python3 scripts/build.py`；解压后的 prod 仍执行 `python3 main.py`。
新增模块、`scripts/` 和运行资源由构建脚本默认收集；仍不自动安装第三方依赖，增加依赖时明确准备其产物。打包使用 Python 3.11+ 标准库，排除/安全链接及隔离解压自检见 [生产制品与运行资源](../docs/06-deploy-release.md#生产制品与运行资源)。

平台 process 检查只确认根进程连续存活，不判断任务是否正确完成。需要业务健康检查时保留 HTTP worker 模板；不要把健康失败改为 process 来隐藏问题。
