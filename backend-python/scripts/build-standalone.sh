#!/bin/sh
set -e
rm -rf deps
pip3 install -t deps/ -r requirements.txt
zip -r artifact.zip main.py app/ deps/
echo "✅ artifact.zip 已生成"
