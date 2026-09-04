# UserApp Workspace 模板 — 本地开发工具命令
#
# build-skills: 把 skills/ 下每个 skill 打成独立 zip → build/<skill名>.zip。
# 单技能包规范:zip 根为 <skill名>/SKILL.md(一个包一个 skill),
# 供平台逐个上传测试。

SKILLS_OUT ?= build

.PHONY: help build-skills clean-skills

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
