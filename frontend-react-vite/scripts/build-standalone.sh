#!/bin/sh
# Vite SPA 构建：产物 = dist/ 目录（static 形态 artifact，平台直接托管）
set -e
pnpm install --frozen-lockfile
pnpm run build
echo "✅ dist/ 已生成"
