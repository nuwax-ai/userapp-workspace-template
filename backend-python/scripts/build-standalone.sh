#!/bin/sh
set -e
rm -rf deps
pip3 install -t deps/ -r requirements.lock
zip -r artifact.zip main.py app/ deps/ -x '*/__pycache__/*' '*.pyc'
echo "✅ artifact.zip 已生成"
