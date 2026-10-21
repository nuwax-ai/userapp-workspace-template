#!/bin/sh
# Vite SPA 构建：产物 = dist/ 目录（static 形态 artifact，平台直接托管）
set -e
# 平台导出链会过滤 pnpm-lock.yaml（既定设计），lockfile 不能假设存在：
# 裸 install 缺失时自动生成（与 project.manifest.toml [devbuild] 同语义）。
pnpm install
pnpm run build
# 平台包装真实 dist/：先过滤私有/排除项并物化安全链接，再只读核验。
python3 scripts/artifact_pack.py --mode static --prepare-dir dist --required index.html
python3 scripts/artifact_pack.py --mode static --check-dir dist --required index.html
echo "✅ dist/ 已生成"
