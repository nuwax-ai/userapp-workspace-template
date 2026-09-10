#!/bin/sh
set -e
# -o 直接写 ./server 在服务运行中会撞 ETXTBSY（dev/restart 编译时旧进程
# 仍在跑）；先落临时名再 mv 原子换入（rename 覆盖合法，旧进程用旧 inode）。
go build -ldflags="-s -w" -trimpath -o server.tmp ./cmd/server
mv -f server.tmp server
# 先删旧 zip：zip 对已存在文件是更新模式，产物集合变化时旧条目会残留
rm -f artifact.zip
zip artifact.zip server
echo "✅ artifact.zip 已生成"
