#!/bin/sh
set -e
cargo build --release
# 编译产物经临时名 + mv 原子换入：cp 直接覆盖正在执行的 ./server 会撞
# ETXTBSY（dev/restart 编译时旧服务进程仍在跑）；rename(2) 覆盖合法，
# 旧进程继续用旧 inode，下次启动用新文件。
cp target/release/server server.tmp
mv -f server.tmp server
zip artifact.zip server
echo "✅ artifact.zip 已生成"
