# Python 常驻 worker

需要 app-cli >= 0.3.9。当前新增模板尚待配套运行时发布，不随 template-cli 0.1.16 提供。

在包含 web 服务的 workspace 中执行 `template-cli add worker-python --service-id queue-worker`。
无需 HTTP listener 或第三方库。`main.py` 的任务循环中实现实际工作，初始化错误直接传播。

开发命令：`python3 main.py`。制品构建：`python3 scripts/build.py`；解压后的 prod 仍执行 `python3 main.py`。
增加模块或依赖后要同步构建脚本，确保产物包括全部运行依赖。

平台 process 检查只确认根进程连续存活，不判断任务是否正确完成。需要业务健康检查时保留 HTTP worker 模板；不要把健康失败改为 process 来隐藏问题。
