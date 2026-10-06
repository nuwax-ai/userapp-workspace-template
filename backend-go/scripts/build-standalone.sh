#!/bin/sh
set -e
# -o 直接写 ./server 在服务运行中会撞 ETXTBSY（dev/restart 编译时旧进程
# 仍在跑）；先落临时名再 mv 原子换入（rename 覆盖合法，旧进程用旧 inode）。
go build -ldflags="-s -w" -trimpath -o server.tmp ./cmd/server
mv -f server.tmp server
# 默认收集编译输出及非源码/缓存/私有的运行资源；先验证 run/migrate。
# ZIP 独立生成并原子替换，打包失败保留上一份有效制品。
python3 scripts/artifact_pack.py --mode compiled --required server
echo "✅ artifact.zip 已生成"
