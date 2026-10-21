#!/bin/sh
set -e
./mvnw clean package -DskipTests
# jar 经临时名 + mv 原子换入：cp 直接覆盖运行中 JVM 正在用的 app.jar 虽无
# ETXTBSY（jar 非 exec 映射），但 JVM 运行中 lazy-load 类会读到新旧混合的
# 损坏数据；rename(2) 换入让旧进程用旧 inode，下次启动用新文件。
cp target/*.jar app.jar.tmp
mv -f app.jar.tmp app.jar
# 默认收集编译输出及非源码/缓存/私有的运行资源；先验证 run/migrate。
# ZIP 独立生成并原子替换，打包失败保留上一份有效制品。
python3 scripts/artifact_pack.py --mode compiled --required app.jar
echo "✅ artifact.zip 已生成"
