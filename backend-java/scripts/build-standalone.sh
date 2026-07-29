#!/bin/sh
set -e
javac Main.java
zip artifact.zip Main.class
echo "✅ artifact.zip 已生成"
