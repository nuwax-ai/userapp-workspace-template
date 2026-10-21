# Vue Vite Template — Agent Contract

## Goal

Use this template with deterministic rules so AI agents can deliver features quickly with minimal guessing.

## Command Contract

Use `pnpm` only.

```bash
pnpm dev         # Start dev server
pnpm build       # Build production assets
pnpm type-check  # TypeScript check (vue-tsc)
pnpm lint        # ESLint
pnpm check       # Required gate: type-check + lint
```

## Task Entry (always follow)

1. Confirm target template and feature goal in one sentence.
2. Locate the matching module area (`pages`, `components`, `lib`, `router`).
3. Reuse existing patterns from `src/examples` and `src/components/ui`.
4. Implement with framework-native style (Vue Composition API + `<script setup lang="ts">`).
5. Run `pnpm check` before finalizing.

## UserApp 公共路由

- 修改路由前读取 `userapp-dev-guide` 的路由章节；追加模块用 `userapp-scaffold`，不要复制目录。
- 公共路径只改本目录 `project.manifest.toml` 的 `[proxy].path`。Vite 通过 `scripts/manifest-routing.mjs`
  自动读取 dev/build base；不写死 base、不加路径环境变量或 `--base` 覆盖。
- 保留模板的 `strip_prefix = true`、`dev_strip_prefix = false`、PORT、health 和入口跳转逻辑。
- 改路径后重启 dev，重新构建 prod，更新导航链接。模块公共资源可用 `import.meta.env.BASE_URL`。
- 追加同类前端须唯一 service_id/path；分别检查真实 JS、HMR 和页面内容，首页 200 不代表脚本可用。

## Isomorphic Structure Mapping

Use these module locations in this Vue template:

| Concern             | Vue location                 |
| ------------------- | ---------------------------- |
| Route pages         | `src/pages/*.vue`            |
| Shared components   | `src/components/**`          |
| API client          | `src/lib/api.ts`             |
| Service helpers     | `src/lib/services.ts`        |
| Utilities           | `src/lib/utils.ts`           |
| Router registry     | `src/router/index.ts`        |
| Examples entry page | `src/pages/ExamplesPage.vue` |
| Examples route      | `/#/examples`                |

## Minimal Delivery Paths

### New page (5 steps)

1. Create `src/pages/<FeatureName>.vue`.
2. Add route in `src/router/index.ts` with path + component.
3. Use existing UI primitives from `src/components/ui`.
4. If data is required, call service functions via `src/lib/services.ts`.
5. Run `pnpm check`.

### New component (4 steps)

1. Create component under `src/components/` (or `src/components/ui/` for primitives).
2. Type all props/emits explicitly.
3. Keep styling Tailwind-first and merge classes via `cn` when needed.
4. Run `pnpm check`.

### New API flow (4 steps)

1. Define/extend endpoint calls in `src/lib/api.ts` or service module.
2. Add typed service wrapper in `src/lib/services.ts`.
3. Consume via page/component using `useApi` style pattern.
4. Run `pnpm check`.

## Allowed Changes

- `src/pages/**`, `src/components/**`, `src/lib/**`, `src/router/**`
- Template docs (`AGENTS.md`, template `README` if present)
- Template-local config required for feature delivery

## Forbidden Changes

- Do not copy `src/examples/*` into production files verbatim.
- Do not change package manager (`pnpm` is mandatory).
- Do not add parallel agent rule docs (this file is the single source).
- Do not introduce framework-mixed patterns (keep Vue idioms only).

## Pre-submit Checklist

1. `pnpm check` passes in this template.
2. If template metadata/version changed, validate related metadata files before release.
3. New route/page/API follows the mapping table and naming conventions.
4. `src/examples` remains reference-only.
