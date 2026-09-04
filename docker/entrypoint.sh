#!/bin/bash
# ============================================================================
# 本地验证容器入口（无 supervisor）：起 PG → 按 MODE 分派 → SIGTERM 优雅停
# ============================================================================
# app-cli serve 以 builtin 引擎自管子服务（无需 supervisord）；PG 由本脚本直管。
# MODE（第一个参数）：
#   verify  容器内三步闭环：gen-lock → app-cli build --deploy-dir → serve（默认）
#   dev     源码态：gen-lock → app-cli build --dev → serve（APP_CLI_RUN_PROFILE=dev）
#   serve   直接 app-cli serve（假定 lock/产物已就绪）
#   shell   交互 bash（PG 已起，供排查）
#   其他    透传执行
set -euo pipefail

log() { echo "[entrypoint] $*" | tee -a /app/logs/entrypoint.log; }

# Debian postgresql-16 的二进制不在 PATH(且 pg_wrapper 版找不到裸 pg_ctl 起的实例)
PG_BIN=/usr/lib/postgresql/16/bin

export PGDATA="${PGDATA:-/data/pg}"
export POSTGRES_USER="${POSTGRES_USER:-app}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-app}"
export POSTGRES_DB="${POSTGRES_DB:-app}"

mkdir -p /run/app-cli /run/postgresql /app/logs "$PGDATA"
# pg_ctl 以 postgres 身份写 /app/logs/pg.log → 日志目录放开写权限
# （app-cli 以 root 写各服务子目录，互不影响）
chmod 0777 /app/logs 2>/dev/null || true
chown postgres:postgres /run/postgresql "$PGDATA" 2>/dev/null || true

# PG initdb 幂等（PG_VERSION 缺失才做；半成品清理对齐 rcoder pg-supervisor-entry）。
# 本地验证容器 5432 不对外发布，trust 免密（仅监听 127.0.0.1）。
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  log "首次运行: initdb"
  if [ -d "$PGDATA" ] && [ -n "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
    log "清理上次中断的半成品 PGDATA"
    rm -rf "${PGDATA:?}/"* 2>/dev/null || true
  fi
  su postgres -s /bin/bash -c "'$PG_BIN/initdb' -D '$PGDATA' -E UTF8 --locale=C.UTF-8 \
    --username='$POSTGRES_USER' --auth-host=trust --auth-local=trust"
fi
# postgres 硬性要求 PGDATA u=rwx(0700)（挂载卷默认 755 会 FATAL）
chmod 700 "$PGDATA" 2>/dev/null || true

su postgres -s /bin/bash -c "'$PG_BIN/pg_ctl' -D '$PGDATA' -l /app/logs/pg.log -w -t 60 start \
  -o '-c listen_addresses=127.0.0.1 -c unix_socket_directories=/run/postgresql'"

# 建业务库（幂等）：initdb 只建角色不建库，服务连 $POSTGRES_DB
su postgres -s /bin/bash -c "'$PG_BIN/createdb' -h 127.0.0.1 -U '$POSTGRES_USER' '$POSTGRES_DB'" \
  2>/dev/null || log "数据库 $POSTGRES_DB 已存在"

# 等 pg_isready（60s 预算；app-cli serve 内部还会再等一轮，双保险）
for _ in $(seq 1 30); do "$PG_BIN/pg_isready" -q -h 127.0.0.1 -p 5432 && break; sleep 2; done
"$PG_BIN/pg_isready" -q -h 127.0.0.1 -p 5432 || { log "PG 未就绪（60s）"; exit 1; }
log "PG ready (127.0.0.1:5432)"

MODE="${1:-verify}"
shift || true
case "$MODE" in
  verify) CMD=(bash /app/code/docker/scripts/container-verify.sh) ;;
  dev)    CMD=(bash /app/code/docker/scripts/container-dev.sh) ;;
  serve)  CMD=(/usr/local/bin/app-cli-bin serve) ;;
  shell)  CMD=(bash -l) ;;
  *)      CMD=("$MODE" "$@") ;;
esac

child=""
stop_pg() {
  log "优雅停 PG"
  su postgres -s /bin/bash -c "'$PG_BIN/pg_ctl' -D '$PGDATA' -m fast stop" || true
}
on_term() {
  # 转发 TERM 给 app-cli（其内部级联停 pingap 与各子服务）→ 等 → 停 PG
  [ -n "$child" ] && kill -TERM "$child" 2>/dev/null
  [ -n "$child" ] && wait "$child" 2>/dev/null
  stop_pg
  exit 0
}
trap on_term TERM INT

"${CMD[@]}" &
child=$!
wait "$child"
rc=$?
trap - TERM INT
stop_pg
exit "$rc"
