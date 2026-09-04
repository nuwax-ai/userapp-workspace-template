#!/bin/bash
# 容器内源码态 dev 编排（entrypoint dev 模式调用）。
# build --dev 三分派（与平台 dev 链路同一实现）：配 [devbuild] 跑之；仅配
# [devrun] 的服务跳过编译（devrun 自足）；未配 [devrun] 回落 [build].command
# （产物落源码目录——平台源码态语义）。serve 以 APP_CLI_RUN_PROFILE=dev 编排
# 源码 workspace，devrun 命令热加载（vite/next dev 改码即生效）。
set -euo pipefail

WS="${APP_CLI_WORKSPACE:-/app/code}"

echo "===== [1/3] manifest 校验（gen-lock）====="
/usr/local/bin/app-cli-bin --gen-lock "$WS"

echo "===== [2/3] dev 构建（三分派）====="
/usr/local/bin/app-cli-bin build --dev

echo "===== [3/3] 源码态运行（app-cli serve，dev profile）====="
export APP_CLI_RUN_PROFILE=dev
exec /usr/local/bin/app-cli-bin serve
