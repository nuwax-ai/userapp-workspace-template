#!/bin/sh
set -e
./mvnw clean package -DskipTests
cp target/*.jar app.jar
zip artifact.zip app.jar
echo "✅ artifact.zip 已生成"
