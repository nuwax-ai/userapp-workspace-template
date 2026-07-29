#!/bin/sh
set -e
go build -o server ./cmd/server
zip artifact.zip server
echo "✅ artifact.zip 已生成"
