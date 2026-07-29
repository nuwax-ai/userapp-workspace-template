#!/bin/sh
set -e
go build -o server main.go
zip artifact.zip server
echo "✅ artifact.zip 已生成"
