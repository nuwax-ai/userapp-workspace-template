#!/bin/sh
# ============================================================================
# UserApp Next.js 模板启动脚本（支持两种部署模式，自动检测）
# ============================================================================
# 由 rcoder UserApp command 执行：["sh", "/app/code/start.sh"]
#
# 模式（自动检测 /app/code/server.js 是否存在）：
#   - standalone（预 build 产物，推荐）：node migrate + node server，秒级启动
#     （本地 `npm run build:standalone` 产物，容器不需 install/build）
#   - 源码模式（兜底）：install + build + start（容器内 build，开发/首次）
# ============================================================================
set -e
cd /app/code

# helpers.sh 可能不存在（standalone 模式只带 start.sh），存在则 source
if [ -f /app/code/scripts/lib/helpers.sh ]; then
  # shellcheck source=scripts/lib/helpers.sh
  . /app/code/scripts/lib/helpers.sh
fi

# log / wait_for_pg_inline 内联兜底（standalone 无 helpers.sh 时）
log() { echo "[$(date '+%H:%M:%S')] $*"; }
wait_for_pg_inline() {
  retries="${1:-30}"; i=1
  while [ "$i" -le "$retries" ]; do
    if PGPASSWORD="${POSTGRES_PASSWORD:-app}" pg_isready -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${POSTGRES_USER:-app}" -q; then
      log "✅ PG ready (after $i attempt(s))"; return 0
    fi
    log "⏳ Waiting for PG ($i/$retries)..."; sleep 2; i=$((i + 1))
  done
  log "❌ PG not ready after $retries attempts"; return 1
}
# 优先 helpers.sh 的 wait_for_pg，否则内联
wait_pg() {
  if command -v wait_for_pg >/dev/null 2>&1; then
    wait_for_pg 30 2 || { log "❌ Cannot start without PG"; exit 1; }
  else
    wait_for_pg_inline || { log "❌ Cannot start without PG"; exit 1; }
  fi
}

# ============================================================================
# standalone 模式（预 build 产物，秒级启动）
# ============================================================================
if [ -f /app/code/server.js ]; then
  log "🚀 Standalone 模式（预 build 产物）"
  log "🗄️ Waiting for PostgreSQL..."
  wait_pg
  log "🛠️ Running migrations (node migrate.js)..."
  if node /app/code/migrate.js; then
    log "  ✅ migrations applied"
  else
    log "  ⚠️ migration failed — app may malfunction (check /api/health)"
  fi
  log "🏃 Starting Next.js (node server.js)..."
  # 强制 0.0.0.0：K8s 自动注入 HOSTNAME=pod 名，会让 standalone server.js 绑 pod hostname
  # （而非监听所有接口），导致 pingora 转发 502。不能用 ${HOSTNAME:-0.0.0.0}（K8s 已设值）。
  export HOSTNAME=0.0.0.0
  export PORT="${PORT:-3000}"
  exec node /app/code/server.js
  exit 0
fi

# ============================================================================
# 源码模式（容器内 install + build + start）
# ============================================================================
log "🏗️ 源码模式（容器内 build）"

install_deps() {
  log "📦 Installing dependencies..."
  # --include=dev: next build 需要 devDep 里的构建工具（@tailwindcss/postcss/typescript）。
  # RCoder 在容器内 build，NODE_ENV=production 会让 npm install 默认 omit dev。
  npm install --no-audit --no-fund --include=dev || {
    log "⚠️ npm install failed, retrying with legacy-peer-deps..."
    npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  }
}

run_migrations() {
  log "🛠️ Running Drizzle migrations..."
  if npm run db:migrate; then
    log "  ✅ migrations applied"
  else
    log "  ⚠️ migration failed — app may malfunction (check /api/health)"
  fi
}

start_app() {
  log "🚀 Starting Next.js..."
  if [ "${NODE_ENV}" = "production" ]; then
    log "  Mode: production (build + start)"
    npm run build
    exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
  else
    log "  Mode: development (dev server with HMR)"
    exec npx next dev -H 0.0.0.0 -p "${PORT:-3000}"
  fi
}

install_deps
wait_pg
run_migrations
start_app
