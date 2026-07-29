#!/bin/sh
# Vite SPA standalone build：npm build → 复制 static-server.cjs → zip
set -e
npm install --no-audit --no-fund
npm run build
cp static-server.cjs dist/
cd dist && zip -r ../artifact.zip . && cd ..
echo "✅ artifact.zip 已生成"
