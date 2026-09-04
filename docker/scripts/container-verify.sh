#!/bin/bash
# 容器内产物态验证三步闭环（entrypoint verify 模式调用）。
# 产物解压不落源码目录——next 的 standalone zip 含精简版 package.json，
# 解压回源码会覆盖仓库文件；.docker-run/ = 平台 .run 部署语义的本地等价。
set -euo pipefail

WS="${APP_CLI_WORKSPACE:-/app/code}"

echo "===== [1/3] manifest 校验（gen-lock，失败早退）====="
/usr/local/bin/app-cli-bin --gen-lock "$WS"

echo "===== [2/3] 全服务构建 + 组装产物态部署布局 ====="
/usr/local/bin/app-cli-bin build --deploy-dir "$WS/.docker-run"

echo "===== [3/3] 产物态运行（app-cli serve）====="
# exec 保持 PID → entrypoint 的 wait/信号链不断；serve 读部署目录内的 lock 编排
# （--workspace 是顶层参数，须在子命令前）
exec /usr/local/bin/app-cli-bin --workspace "$WS/.docker-run" serve
