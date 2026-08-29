#!/bin/sh
set -e
rm -rf deps
# Python 版本契约：builder 与 app-runtime 镜像统一 rust:bookworm（原生 3.11
# 同 ABI）——裸安装即产出运行时可载的 wheel，无需跨版本钉参
pip3 install -t deps/ -r requirements.lock
zip -r artifact.zip main.py app/ deps/ -x '*/__pycache__/*' '*.pyc'
echo "✅ artifact.zip 已生成"
