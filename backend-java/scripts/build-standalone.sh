#!/bin/sh
set -e
./mvnw clean package -DskipTests
# jar 经临时名 + mv 原子换入：cp 直接覆盖运行中 JVM 正在用的 app.jar 虽无
# ETXTBSY（jar 非 exec 映射），但 JVM 运行中 lazy-load 类会读到新旧混合的
# 损坏数据；rename(2) 换入让旧进程用旧 inode，下次启动用新文件。
cp target/*.jar app.jar.tmp
mv -f app.jar.tmp app.jar
# 先删旧 zip：zip 对已存在文件是更新模式，产物集合变化时旧条目会残留
rm -f artifact.zip
zip artifact.zip app.jar
echo "✅ artifact.zip 已生成"
