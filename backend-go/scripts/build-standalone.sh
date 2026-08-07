#!/bin/sh
set -e
go build -ldflags="-s -w" -trimpath -o server ./cmd/server
zip artifact.zip server
echo "✅ artifact.zip 已生成"
