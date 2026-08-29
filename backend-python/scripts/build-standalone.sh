#!/bin/sh
set -e
rm -rf deps
# 钉运行时 ABI：app-runtime 镜像 python 3.13（builder 3.11）——跨版本装 3.13
# wheel（--only-binary 必须；平台默认当前 aarch64/x86_64 与 runtime 一致）
pip3 install -t deps/ --python-version 3.13 --only-binary=:all: -r requirements.lock
zip -r artifact.zip main.py app/ deps/ -x '*/__pycache__/*' '*.pyc'
echo "✅ artifact.zip 已生成"
