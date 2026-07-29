#!/bin/sh
set -e
mvn clean package -DskipTests
cp target/*.jar app.jar
zip artifact.zip app.jar
echo "✅ artifact.zip 已生成"
