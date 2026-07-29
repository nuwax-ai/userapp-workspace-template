#!/bin/sh
# ============================================================================
# 共享 helper —— start.sh 及未来脚本 source 使用。
# POSIX sh 兼容（RCoder 用 sh 执行 start.sh）。
# ============================================================================

# 统一日志（带时间前缀，易识别）
log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

# 等 PG 就绪：pg_isready 轮询，超时显式报错返回非零（绝不静默吞错）。
# 用法：wait_for_pg [max_retries] [sleep_secs]
wait_for_pg() {
  retries="${1:-30}"
  sleep_secs="${2:-2}"
  host="${PGHOST:-localhost}"
  port="${PGPORT:-5432}"
  user="${POSTGRES_USER:-app}"
  i=1
  while [ "$i" -le "$retries" ]; do
    if PGPASSWORD="${POSTGRES_PASSWORD:-app}" pg_isready -h "$host" -p "$port" -U "$user" -q; then
      log "✅ PG ready (after $i attempt(s))"
      return 0
    fi
    log "⏳ Waiting for PG at $host:$port ($i/$retries)..."
    sleep "$sleep_secs"
    i=$((i + 1))
  done
  log "❌ PG not ready after $retries attempts — aborting"
  return 1
}
