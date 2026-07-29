#!/bin/sh
set -e
cargo build --release
cp target/release/server .
zip artifact.zip server
echo "✅ artifact.zip 已生成"
