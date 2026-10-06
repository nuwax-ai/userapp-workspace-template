#!/bin/sh
# Vite SPA 构建：产物 = dist/ 目录（static 形态 artifact，平台直接托管）
set -e
# 平台导出链会过滤 pnpm-lock.yaml（既定设计），lockfile 不能假设存在：
# 裸 install 缺失时自动生成（与 project.manifest.toml [devbuild] 同语义）。
pnpm install
pnpm run build
# prod 仍以 dist/ 为运行边界；检查完整目录和安全链接，不带开发源码。
python3 scripts/artifact_pack.py --mode static --check-dir dist --required index.html
echo "✅ dist/ 已生成"
