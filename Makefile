# UserApp Workspace 模板 — 本地开发工具命令
#
# build-skills: 把 skills/ 下每个 skill 打成独立 zip → build/<skill名>.zip。
# 单技能包规范:zip 根为 <skill名>/SKILL.md(一个包一个 skill),
# 供平台逐个上传测试。

SKILLS_OUT ?= build

COMPOSE ?= docker compose
COMPOSE_FILE ?= docker/docker-compose.yml

.PHONY: help build-skills clean-skills docker-build docker-verify docker-dev docker-shell docker-down docker-down-clean

help: ## 显示可用命令
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build-skills: ## 每个 skill 打独立 zip → $(SKILLS_OUT)/<skill名>.zip
	@set -e; \
	mkdir -p $(SKILLS_OUT); \
	for d in skills/*/; do \
		name=$${d%/}; name=$${name##*/}; \
		[ -f "$$d/SKILL.md" ] || { echo "✗ $$d 缺少 SKILL.md" >&2; exit 1; }; \
		rm -f $(SKILLS_OUT)/$$name.zip; \
		( cd skills && zip -r -X -q ../$(SKILLS_OUT)/$$name.zip $$name -x '*.DS_Store' ); \
		echo "✓ $(SKILLS_OUT)/$$name.zip"; \
	done

clean-skills: ## 删除 skills 打包产物
	rm -rf $(SKILLS_OUT)/

# ── Docker 本地验证（自包含镜像:多语言工具链 + app-cli(npm) + pingap + PG16）──
# 前置:@nuwax-ai/app-cli npm 包已发布(版本对齐 docker/Dockerfile 的 APP_CLI_VERSION)。
# 详见 docker/README.md。

docker-build: ## 构建本地验证镜像
	$(COMPOSE) -f $(COMPOSE_FILE) build

docker-verify: ## 端到端验证:manifest 校验+全量构建+产物态运行 → 宿主机路由冒烟
	$(COMPOSE) -f $(COMPOSE_FILE) up -d --build
	@echo "等待容器内构建完成(首次下载全部依赖约 10-20 分钟,缓存卷命中后分钟级)..."
	@for i in $$(seq 1 240); do \
		docker ps --format '{{.Names}}' | grep -q '^userapp-local$$' || { \
			echo '✗ 容器已退出(构建/gen-lock 失败?),最近日志:'; \
			docker logs --tail 60 userapp-local 2>&1 || true; exit 1; }; \
		docker logs userapp-local 2>&1 | grep -q '产物态运行' && break; \
		sleep 15; \
	done; \
	docker logs userapp-local 2>&1 | grep -q '产物态运行' || { \
		echo '✗ 60 分钟内未见「产物态运行」(构建卡住/超慢?),最近日志:'; \
		docker logs --tail 60 userapp-local 2>&1 || true; exit 1; }
	./docker/scripts/verify.sh || { echo "排查:docker logs -f userapp-local / make docker-shell"; exit 1; }

docker-dev: ## dev 源码态运行(vite/next 热加载;与 docker-verify 端口互斥,先 docker-down)
	$(COMPOSE) -f $(COMPOSE_FILE) --profile dev up -d --build userapp-dev
	@echo "→ http://localhost:9080/react  /vue  /(next)  改码即生效(CHOKIDAR 轮询已开)"

docker-shell: ## 进验证容器排查(PG 已启动,可 psql/手跑构建)
	$(COMPOSE) -f $(COMPOSE_FILE) run --rm userapp shell

docker-down: ## 停容器(保留缓存卷,二次构建快)
	$(COMPOSE) -f $(COMPOSE_FILE) --profile dev down

docker-down-clean: ## 停容器并删全部缓存卷(下次全量重建)
	$(COMPOSE) -f $(COMPOSE_FILE) --profile dev down -v
