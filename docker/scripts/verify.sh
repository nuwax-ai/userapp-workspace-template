#!/usr/bin/env bash
# ============================================================================
# 经 pingap 9080 的路由冒烟断言（宿主机跑；容器须已在跑 verify/dev 模式）
# ============================================================================
# 断言面：
# - 4 个后端 readiness（strip_prefix 转发语义）
# - react/vue 静态页 + index.html 引用的全部资源逐个 200（static 托管冒烟，
#   与平台构建期的 static 产物路由一致性检查互为对偶）
# - next catch-all 根路由（本模板根 index.html 被 next 遮蔽）
# - app-cli 管理 API /ready
# macOS 兼容（BSD grep/date）；失败汇总 + 非零退出。
set -uo pipefail

# 注意默认用 127.0.0.1 而非 localhost：部分 Docker 桌面(OrbStack)的
# localhost 会先解析到 ::1,而 IPv6 映射不通(连接被重置)。
BASE="${BASE:-http://127.0.0.1:9080}"
ADMIN="${ADMIN:-http://127.0.0.1:3010}"
pass=0
fail=0
FAILED=()

wait_http() { # $1=url $2=预算秒 → 0=200 / 1=超时
  local deadline=$(( $(date +%s) + $2 )) code
  while [ "$(date +%s)" -lt "$deadline" ]; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" 2>/dev/null || true)
    [ "$code" = "200" ] && return 0
    sleep 2
  done
  return 1
}

assert() { # $1=label $2=url $3=预算秒
  if wait_http "$2" "$3"; then
    echo "[OK]   $1"
    pass=$((pass + 1))
  else
    echo "[FAIL] $1  ($2 超时 ${3}s)"
    fail=$((fail + 1))
    FAILED+=("$1")
  fi
}

check_page_and_assets() { # $1=label $2=路径
  if ! wait_http "$BASE$2" 90; then
    echo "[FAIL] $1 页面 ($2)"
    fail=$((fail + 1))
    FAILED+=("$1 页面")
    return
  fi
  echo "[OK]   $1 页面"
  pass=$((pass + 1))
  # 提取绝对路径资源引用（vite build base 已带 /react/ /vue/ 前缀；next 走 /_next/）
  local html
  html=$(curl -fsS --max-time 5 "$BASE$2" 2>/dev/null || true)
  local u
  for u in $(printf '%s' "$html" | grep -oE '(src|href)="[^"]+"' \
             | sed -E 's/^(src|href)="//; s/"$//' | grep -E '^/' | sort -u); do
    assert "$1 资源 $u" "$BASE$u" 60
  done
}

echo "== 后端 readiness（java/python 预算最宽：java startup_timeout 60s + Spring 冷启动；python 的 asyncpg 连接在多服务启动突发下偶发分钟级——backend-python ensure_schema 自带超时重试自愈）=="
assert "go/ready"       "$BASE/api/go/ready"                       120
assert "java/readiness" "$BASE/api/java/actuator/health/readiness" 240
assert "python/ready"   "$BASE/api/python/ready"                   240
assert "rust/ready"     "$BASE/api/rust/ready"                     120

echo "== 前端静态托管 =="
check_page_and_assets react "/react"
check_page_and_assets vue   "/vue"

echo "== next catch-all =="
check_page_and_assets next "/"

echo "== 管理 API =="
assert "admin /ready" "$ADMIN/ready" 60

echo "----- 冒烟汇总: pass=$pass fail=$fail -----"
if [ "$fail" -gt 0 ]; then
  printf '失败项: %s\n' "${FAILED[*]}"
  exit 1
fi
exit 0
